/**
 * Payment Route — QuickBooks Payments
 *
 * Flow:
 *   1. Client tokenizes card via qbpayments.js → sends token here
 *   2. We re-check eligibility server-side
 *   3. Charge via QB Payments API
 *   4. Create QB invoice + customer record (accounting)
 *   5. Queue PracticeQ browser automation. Pharmacy waits for PracticeQ completion.
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
import * as pharmacy from "@/services/pharmacy";
import * as spruceServer from "@/services/spruce.server";
import { sendAdminNotification } from "@/services/admin-notifications";
import { createPracticeQAutomationJob } from "@/services/practiceq-automation";
import { checkEligibility } from "@/lib/eligibility";
import { seedQuestions } from "@/data/seed-data";
import { buildIdentityUploadUrl, createIdentityUploadToken, getIdentityGate, statusFromAiResult } from "@/lib/identity";
import { generateId } from "@/lib/utils";
import { logPhiAccess, logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import { verifyIdentityUploads } from "@/services/identity-verification";
import { getChargeAmount } from "@/lib/payment-amount";
import { resolvePersistedDose } from "@/lib/product-dose";
import { validatePaymentQuestionnaire } from "@/lib/payment-questionnaire";
import { ensurePracticeQRequiredQuestions } from "@/lib/questionnaire-catalog";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { shouldBypassQuickBooksPayment } from "@/lib/payment-bypass";
import { normalizeProduct, tirzepatideProduct } from "@/data/products";
import type { Payment, Upload } from "@/types";

async function wakePracticeQRemoteWorker() {
  const remoteBase = process.env.PRACTICEQ_REMOTE_PUBLIC_URL;
  if (!remoteBase) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    await fetch(new URL("/health", remoteBase).toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, token, cardNumber, expMonth, expYear, cvc, cardName, cardLast4, cardBrand, amount, patientData, orderData, productData, identityUploads, questionnaireAnswers, consentData } = body;
    const bypassQuickBooksPayment = shouldBypassQuickBooksPayment();
    const chargeAmount = bypassQuickBooksPayment ? 0.01 : getChargeAmount(amount);

    if (!orderId || chargeAmount === null) {
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
    const persistedDose = resolvePersistedDose(persistedProduct, productData ?? null, orderData?.doseId);

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

    const productForIntegrations = normalizeProduct(
      persistedProduct ??
      productData ??
      (await dbServer.productDb.getById(order.productId).catch(() => null)) ??
      db.productDb.getById(order.productId) ??
      tirzepatideProduct
    );

    // 2. Duplicate submission guard
    if (order.status !== "draft") {
      return NextResponse.json(
        { error: "Order already processed", orderStatus: order.status },
        { status: 409 }
      );
    }

    // 3. Server-side eligibility re-check
    // Persist submitted answers to Postgres so provider chart can read them
    const submittedAnswerRows = questionnaireAnswers && typeof questionnaireAnswers === "object"
      ? Object.entries(questionnaireAnswers as Record<string, string>)
          .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
          .map(([questionId, answer]) => ({
            id: `answer_${orderId}_${questionId}`,
            orderId,
            questionId,
            answer,
            createdAt: new Date().toISOString(),
          }))
      : [];
    if (submittedAnswerRows.length) {
      await Promise.all(submittedAnswerRows.map((a) => dbServer.answerDb.create(a).catch(() => {}))).catch(() => {});
    }
    if (consentData?.signedName) {
      await dbServer.consentDb.create({
        id: `consent_${orderId}`,
        orderId,
        consentText: "Patient consented to telehealth services and data collection.",
        acknowledgments: consentData.acknowledgments ?? { telehealth: true, pharmacy: true, payment: true, privacy: true },
        signedName: consentData.signedName,
        signedAt: consentData.signedAt ?? new Date().toISOString(),
      }).catch(() => {});
    }

    const answers = await dbServer.answerDb.getByOrder(orderId).catch(() => []);
    const fallbackAnswers = answers.length ? answers : (submittedAnswerRows.length ? submittedAnswerRows : db.answerDb.getByOrder(orderId));
    const questions = await dbServer.questionDb.getAll().catch(() => []);
    const localQuestions = db.questionDb.getAll();
    const fallbackQuestions = ensurePracticeQRequiredQuestions(questions.length ? questions : (localQuestions.length ? localQuestions : seedQuestions));
    const questionnaire = validatePaymentQuestionnaire(fallbackAnswers, fallbackQuestions);
    if (!questionnaire.complete) {
      return NextResponse.json(
        {
          error: "Questionnaire answers are required before payment",
          missingQuestions: questionnaire.missingQuestions,
        },
        { status: 422 }
      );
    }

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

    // 5. Charge via QuickBooks Payments, or bypass it while end-to-end intake automation is being tested.
    let chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
    if (bypassQuickBooksPayment) {
      chargeResult = {
        chargeId: `test_bypass_${generateId()}`,
        status: "CAPTURED",
        cardLast4: cardLast4 ?? (String(cardNumber ?? "").replace(/\D/g, "").slice(-4) || "0000"),
        cardBrand: cardBrand ?? "test",
      };
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "quickbooks",
        action: "Payment bypassed for integration testing",
        orderId,
        patientId: patient.id,
        status: "success",
        details: { amount: chargeAmount, mode: "bypass", transactionId: chargeResult.chargeId },
      }).catch(() => {});
    } else {
      try {
        chargeResult = await qbPayments.chargeCard(orderId, patient.id, chargeAmount, {
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
    }

    // 6. Record payment locally
    const payment: Payment = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      amount: chargeAmount,
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
    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
    sendAdminNotification("order_received", {
      orderId,
      patientId: patient.id,
      patientName,
    }).catch(() => {});
    if (!dispatchGate.canDispatch) {
      sendAdminNotification("identity_review_needed", {
        orderId,
        patientId: patient.id,
        patientName,
      }).catch(() => {});
    }

    // Build updatedOrder from known persisted data (localStorage not available server-side).
    const orderForIntegrations = {
      ...order,
      productId: productForIntegrations.id,
      doseId: persistedDose?.id ?? order.doseId,
    };
    const updatedOrder = { ...orderForIntegrations, ...orderUpdates };
    const errors: string[] = [];
    const identityUploadUrl = buildIdentityUploadUrl(req.nextUrl.origin, identityUploadToken);
    let practiceQAutomationStatus: "queued" | "error" = "queued";

    // 8. QuickBooks accounting — customer record + invoice (payment already in QB Payments)
    if (bypassQuickBooksPayment) {
      db.orderDb.update(orderId, { quickbooksStatus: "skipped" });
      await dbServer.orderDb.update(orderId, { quickbooksStatus: "skipped" }).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "quickbooks",
        action: "QuickBooks accounting sync skipped",
        orderId,
        patientId: patient.id,
        status: "success",
        details: { amount: payment.amount, transactionId: payment.transactionId, mode: "bypass" },
      }).catch(() => {});
    } else {
      try {
        const qbCustomerId = await quickbooks.createCustomerRecord(patient);
        const invoiceId = await quickbooks.createInvoice(updatedOrder, payment, {
          patient,
          product: productForIntegrations,
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
    }

    // 9. PracticeQ — queue browser automation. Do not create a PracticeQ chart before payment.
    // PracticeQ completion is tracked separately and does not block pharmacy dispatch.
    try {
      const automationJob = createPracticeQAutomationJob(updatedOrder, patient);
      await dbServer.practiceqAutomationJobDb.create(automationJob);
      db.practiceqAutomationJobDb.create(automationJob);
      db.orderDb.update(orderId, { practiceQStatus: "pending" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "pending" });
      await wakePracticeQRemoteWorker().catch(() => {});
    } catch (e) {
      const errorMessage = (e as Error).message;
      practiceQAutomationStatus = "error";
      errors.push(`PracticeQ automation: ${errorMessage}`);
      db.orderDb.update(orderId, { practiceQStatus: "error" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "error" }).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "practiceq",
        action: "PracticeQ automation queue failed",
        orderId,
        patientId: patient.id,
        status: "error",
        details: { source: "payment_charge" },
        error: errorMessage,
      }).catch(() => {});
    }

    // 10. Pharmacy prescription order
    if (dispatchGate.canDispatch) {
      const pharmacyIntegration = pharmacy.getPharmacyProvider() === "appsheet" ? "appsheet" : "lifefile";
      try {
        const selectedProductDose = productData?.doses?.find((dose: { id: string }) => dose.id === orderData?.doseId);
        const normalized = normalizeOrderForPharmacyDispatch(updatedOrder, productForIntegrations, [
          orderData?.doseId,
          persistedDose?.id,
          selectedProductDose?.label,
          selectedProductDose?.strength,
          selectedProductDose?.patientDescription,
          ...submittedAnswerRows.map((answer) => answer.answer),
        ]);
        if (!normalized.normalizedOrder) {
          throw new Error(`Invalid order data - ${normalized.reason ?? "missing product or dose"}`);
        }
        if (normalized.repaired) {
          db.orderDb.update(orderId, { doseId: normalized.normalizedOrder.doseId });
          await dbServer.orderDb.update(orderId, { doseId: normalized.normalizedOrder.doseId }).catch(() => {});
        }
        const pharmacyOrder = await pharmacy.createPharmacyOrder(normalized.normalizedOrder, { patient, product: productForIntegrations });
        await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
        db.orderDb.update(orderId, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
        await dbServer.orderDb.update(orderId, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" }).catch(() => {});
        logPhiDisclosure(patient.id, orderId, pharmacy.getPharmacyProvider(), auditCtx.actor);
      } catch (e) {
        const errorMessage = (e as Error).message;
        errors.push(`Pharmacy: ${errorMessage}`);
        db.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" });
        await dbServer.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" }).catch(() => {});
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: pharmacyIntegration,
          action: "Pharmacy order submission failed",
          orderId,
          patientId: patient.id,
          status: "error",
          details: { dispatchGate: "identity_verified" },
          error: errorMessage,
        }).catch(() => {});
        logPhiDisclosure(patient.id, orderId, pharmacy.getPharmacyProvider(), auditCtx.actor, "error", errorMessage);
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
      chargedAmount: chargeAmount,
      identityStatus,
      orderStatus: dispatchGate.canDispatch && !errors.some((error) => error.startsWith("Pharmacy:"))
        ? "sent_to_pharmacy"
        : orderUpdates.status,
      pharmacyStatus: dispatchGate.canDispatch && !errors.some((error) => error.startsWith("Pharmacy:"))
        ? "submitted"
        : dispatchGate.canDispatch
          ? "error"
          : "draft",
      identityUploadUrl: dispatchGate.canDispatch ? undefined : identityUploadUrl,
      practiceQAutomationStatus,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    console.error("Payment charge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
