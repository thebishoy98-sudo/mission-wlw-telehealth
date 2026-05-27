/**
 * Payment Route — QuickBooks Payments
 *
 * Flow:
 *   1. Client tokenizes card via qbpayments.js → sends token here
 *   2. We re-check eligibility server-side
 *   3. Charge via QB Payments API
 *   4. Create QB invoice + customer record (accounting)
 *   5. Run integration chain: PracticeQ → Life File → Spruce SMS
 *
 * Client-side tokenization (add to your payment page):
 *   <script src="https://js.intuit.com/v2/ui/payments.js"></script>
 *   intuit.ipp.payments.create({
 *     environment: "production", // or "sandbox"
 *     appKey: process.env.NEXT_PUBLIC_QB_PAYMENTS_APP_KEY,
 *     onSuccess: (token) => { ... POST /api/payments/charge with token }
 *   })
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as qbPayments from "@/services/quickbooks-payments";
import * as quickbooks from "@/services/quickbooks";
import * as practiceq from "@/services/practiceq";
import * as lifefile from "@/services/lifefile";
import * as spruceServer from "@/services/spruce.server";
import { checkEligibility } from "@/lib/eligibility";
import { seedQuestions } from "@/data/seed-data";
import { buildIdentityUploadUrl, createIdentityUploadToken, getIdentityGate, statusFromAiResult } from "@/lib/identity";
import { generateId } from "@/lib/utils";
import { logPhiAccess, logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import { verifyIdentityUploads } from "@/services/identity-verification";
import type { Payment, Upload } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, token, cardNumber, expMonth, expYear, cvc, cardName, cardLast4, cardBrand, amount, patientData, orderData, productData, identityUploads } = body;

    if (!orderId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, amount" },
        { status: 400 }
      );
    }

    // 1. Load order — try server DB first, fall back to localStorage, then inline data
    let order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);

    // Resolve product/dose against the server product row. Browser demo products
    // have generated IDs, but server orders must reference stable Postgres IDs.
    let persistedProduct = productData?.slug
      ? await dbServer.productDb.getBySlug(productData.slug).catch(() => null)
      : null;
    if (productData) {
      if (!persistedProduct) {
        await dbServer.productDb.upsert(productData).catch(() => {});
        persistedProduct =
          (await dbServer.productDb.getBySlug(productData.slug).catch(() => null)) ??
          (await dbServer.productDb.getById(productData.id).catch(() => null));
      }
    }
    const requestedDose = productData?.doses?.find((dose: any) => dose.id === orderData?.doseId);
    const persistedDose = requestedDose && persistedProduct
      ? persistedProduct.doses.find((dose) => dose.label === requestedDose.label || dose.strength === requestedDose.strength)
      : null;

    // Patient must exist before the order because orders.patient_id has an FK. Repeated
    // checkout retries may reuse the same email with a new browser-generated patient id.
    let persistedPatient = patientData?.email
      ? await dbServer.patientDb.getByEmail(patientData.email).catch(() => null)
      : null;
    if (patientData) {
      if (!persistedPatient) {
        persistedPatient = await dbServer.patientDb.create(patientData).catch(() => null);
      } else {
        await dbServer.patientDb.update(persistedPatient.id, {
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          dateOfBirth: patientData.dateOfBirth,
          gender: patientData.gender,
          phone: patientData.phone,
          email: patientData.email,
          address: patientData.address,
          shippingAddress: patientData.shippingAddress?.street1 ? patientData.shippingAddress : patientData.address,
        }).catch(() => persistedPatient);
      }
    }
    const effectivePatient = persistedPatient ?? patientData;
    const normalizedOrderData = orderData && effectivePatient
      ? {
          ...orderData,
          patientId: effectivePatient.id,
          productId: persistedProduct?.id ?? orderData.productId,
          doseId: persistedDose?.id ?? orderData.doseId,
        }
      : orderData;

    // If not found anywhere, create from submitted data (localStorage not accessible server-side)
    if (!order && normalizedOrderData) {
      await dbServer.orderDb.create(normalizedOrderData).catch(() => normalizedOrderData);
      order = normalizedOrderData;
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Duplicate submission guard
    if (order.status !== "draft") {
      return NextResponse.json(
        { error: "Order already processed", orderStatus: order.status },
        { status: 409 }
      );
    }

    // 3. Server-side eligibility re-check
    const answers = await dbServer.answerDb.getByOrder(orderId).catch(() => []);
    const fallbackAnswers = answers.length ? answers : db.answerDb.getByOrder(orderId);
    const questions = await dbServer.questionDb.getAll().catch(() => []);
    const localQuestions = db.questionDb.getAll();
    const fallbackQuestions = questions.length ? questions : (localQuestions.length ? localQuestions : seedQuestions);

    const eligibility = checkEligibility(fallbackAnswers, fallbackQuestions);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: "Patient not eligible for this medication", reason: eligibility.reason },
        { status: 422 }
      );
    }

    // 4. Load patient — create from submitted data if not in server DB
    let patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);

    if (!patient && patientData) {
      try {
        await dbServer.patientDb.create(patientData).catch(() => patientData);
      } catch { /* may already exist */ }
      patient = patientData;
    }

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const auditCtx = actorFromHeaders(req.headers);

    // Audit: PHI accessed for payment processing
    logPhiAccess({
      action: "payment", resource: "patient", resourceId: patient.id,
      patientId: patient.id, orderId,
      actor: auditCtx.actor, actorIp: auditCtx.actorIp, requestId: auditCtx.requestId,
      outcome: "success",
    });

    // 5. Charge via QuickBooks Payments
    let chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
    try {
      chargeResult = await qbPayments.chargeCard(orderId, patient.id, amount, {
        token,
        cardNumber,
        expMonth,
        expYear,
        cvc,
        cardName: cardName ?? `${patient.firstName} ${patient.lastName}`,
        cardLast4,
        cardBrand,
        billingAddress: patient.address,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message ?? "Payment failed" },
        { status: 402 }
      );
    }

    // 6. Record payment locally
    const payment: Payment = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      amount,
      currency: "USD",
      status: "completed",
      paymentMethod: "credit_card",
      cardLast4: chargeResult.cardLast4,
      cardBrand: chargeResult.cardBrand,
      transactionId: chargeResult.chargeId,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    db.paymentDb.create(payment);
    await dbServer.paymentDb.create(payment).catch(() => {});

    // 7. Verify identity when patient submitted usable media. Missing/uncertain identity blocks pharmacy dispatch.
    const identityUploadToken = order.identityUploadToken ?? createIdentityUploadToken(orderId);
    const submittedIdentityMedia = !!identityUploads?.licenseImageData && !!identityUploads?.selfieFrameData;
    const submittedUploads: Upload[] = submittedIdentityMedia
      ? [
          {
            id: generateId(),
            orderId,
            type: "driver_license",
            filename: "identity-document.jpg",
            fileSize: identityUploads.licenseImageData.length,
            mimeType: "image/jpeg",
            base64Data: identityUploads.licenseImageData,
            uploadedAt: new Date().toISOString(),
            status: "uploaded",
          },
          {
            id: generateId(),
            orderId,
            type: "selfie_video",
            filename: "identity-video.webm",
            fileSize: (identityUploads.identityVideoData ?? identityUploads.selfieFrameData).length,
            mimeType: identityUploads.identityVideoData ? "video/webm" : "image/jpeg",
            base64Data: identityUploads.identityVideoData ?? identityUploads.selfieFrameData,
            uploadedAt: new Date().toISOString(),
            status: "uploaded",
          },
        ]
      : [];
    const identityAiUploads = submittedUploads.map((upload) =>
      upload.type === "selfie_video" ? { ...upload, mimeType: "image/jpeg", base64Data: identityUploads.selfieFrameData } : upload
    );

    if (submittedUploads.length) {
      submittedUploads.forEach((upload) => db.uploadDb.create(upload));
      await Promise.all(submittedUploads.map((upload) => dbServer.uploadDb.create(upload).catch(() => upload)));
    }

    const identityAiResult = submittedUploads.length
      ? await verifyIdentityUploads(identityAiUploads, {
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
          dateOfBirth: patient?.dateOfBirth,
        })
      : {
          status: "missing" as const,
          confidence: 0,
          summary: "Patient did not submit both identity verification uploads before payment.",
          flags: ["missing_identity_uploads"],
          checkedAt: new Date().toISOString(),
        };
    const hasSubmittedIdentity = submittedUploads.length > 0;
    const identityStatus = hasSubmittedIdentity ? statusFromAiResult(identityAiResult) : "missing";
    const dispatchGate = getIdentityGate({ identityStatus });

    // 8. Update order status
    const orderUpdates = {
      status: dispatchGate.canDispatch ? "approved" as const : "pending_review" as const,
      paymentStatus: "completed" as const,
      pharmacyStatus: "draft" as const,
      identityStatus,
      identityReason: identityAiResult.summary,
      identityAiResult,
      identityUploadToken,
      submittedAt: new Date().toISOString(),
    };
    db.orderDb.update(orderId, orderUpdates);
    await dbServer.orderDb.update(orderId, orderUpdates).catch(() => {});

    // Build updatedOrder from known data (localStorage not available server-side)
    const updatedOrder = { ...order, ...orderUpdates };
    const errors: string[] = [];
    const identityUploadUrl = buildIdentityUploadUrl(req.nextUrl.origin, identityUploadToken);

    // 8. QuickBooks accounting — customer record + invoice (payment already in QB Payments)
    try {
      const qbCustomerId = await quickbooks.createCustomerRecord(patient);
      const invoiceId = await quickbooks.createInvoice(updatedOrder, payment, {
        patient,
        product: productData ?? null,
        qbCustomerId,
      });
      await quickbooks.recordPayment(invoiceId, payment.amount, qbCustomerId);
      db.orderDb.update(orderId, { quickbooksStatus: "invoiced" });
      await dbServer.orderDb.update(orderId, { quickbooksStatus: "invoiced" }).catch(() => {});
    } catch (e) {
      const errorMessage = (e as Error).message;
      errors.push(`QuickBooks accounting: ${errorMessage}`);
      db.orderDb.update(orderId, { quickbooksStatus: "error" });
      await dbServer.orderDb.update(orderId, { quickbooksStatus: "error" }).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "quickbooks",
        action: "QuickBooks accounting sync failed",
        orderId,
        patientId: patient.id,
        status: "error",
        details: { amount: payment.amount, transactionId: payment.transactionId },
        error: errorMessage,
      }).catch(() => {});
    }

    // 9. PracticeQ — intake packet for provider chart
    try {
      await practiceq.submitIntakePacket(updatedOrder, { patient, product: productData ?? null });
      db.orderDb.update(orderId, { practiceQStatus: "submitted" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "submitted" }).catch(() => {});
      logPhiDisclosure(patient.id, orderId, "practiceq", auditCtx.actor);
    } catch (e) {
      errors.push(`PracticeQ: ${(e as Error).message}`);
      logPhiDisclosure(patient.id, orderId, "practiceq", auditCtx.actor, "error", (e as Error).message);
    }

    // 10. Life File — pharmacy prescription order
    if (dispatchGate.canDispatch) {
      try {
        const pharmacyOrder = await lifefile.createPharmacyOrder(updatedOrder, { patient, product: productData ?? null });
        await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
        db.orderDb.update(orderId, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
        await dbServer.orderDb.update(orderId, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" }).catch(() => {});
        logPhiDisclosure(patient.id, orderId, "lifefile", auditCtx.actor);
      } catch (e) {
        const errorMessage = (e as Error).message;
        errors.push(`Life File: ${errorMessage}`);
        db.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" });
        await dbServer.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" }).catch(() => {});
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: "lifefile",
          action: "Pharmacy order submission failed",
          orderId,
          patientId: patient.id,
          status: "error",
          details: { dispatchGate: "identity_verified" },
          error: errorMessage,
        }).catch(() => {});
        logPhiDisclosure(patient.id, orderId, "lifefile", auditCtx.actor, "error", errorMessage);
      }
    } else {
      db.orderDb.update(orderId, { pharmacyStatus: "draft" });
      await dbServer.orderDb.update(orderId, { pharmacyStatus: "draft" }).catch(() => {});
    }

    // 11. Spruce SMS — "payment received, order processing"
    try {
      await spruceServer.sendMessage(
        patient,
        dispatchGate.canDispatch
          ? "payment_received"
          : hasSubmittedIdentity
            ? "identity_review_received"
            : "identity_upload_reminder",
        { orderId, uploadUrl: identityUploadUrl }
      );
      logPhiDisclosure(patient.id, orderId, "spruce", auditCtx.actor);
    } catch (e) {
      errors.push(`Spruce SMS: ${(e as Error).message}`);
    }

    // 12. Provider review record
    const reviewRecord = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      status: dispatchGate.canDispatch ? "approved" as const : "needs_more_info" as const,
      reviewedAt: dispatchGate.canDispatch ? new Date().toISOString() : undefined,
      reviewedBy: dispatchGate.canDispatch ? "system-auto" : undefined,
      notes: dispatchGate.canDispatch
        ? "Auto-approved: patient passed eligibility and identity screening"
        : `Payment collected. Pharmacy dispatch blocked until identity is approved. Upload link: ${identityUploadUrl}`,
      identityAiResult,
      identityReviewRequired: !dispatchGate.canDispatch,
    };
    db.providerReviewDb.create(reviewRecord);
    await dbServer.providerReviewDb.create(reviewRecord).catch(() => {});

    // 13. Trigger AI eligibility pre-screen in background (non-blocking)
    if (process.env.ANTHROPIC_API_KEY) {
      fetch(`${req.nextUrl.origin}/api/ai/eligibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {}); // fire and forget
    }

    return NextResponse.json({
      success: true,
      orderId,
      chargeId: chargeResult.chargeId,
      identityStatus,
      orderStatus: dispatchGate.canDispatch && !errors.some((error) => error.startsWith("Life File:"))
        ? "sent_to_pharmacy"
        : orderUpdates.status,
      pharmacyStatus: dispatchGate.canDispatch && !errors.some((error) => error.startsWith("Life File:"))
        ? "submitted"
        : dispatchGate.canDispatch
          ? "error"
          : "draft",
      identityUploadUrl: dispatchGate.canDispatch ? undefined : identityUploadUrl,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    console.error("Payment charge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
