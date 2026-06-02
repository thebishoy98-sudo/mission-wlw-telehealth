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
import {
  queuePracticeQAutomationForOrder,
  wakePracticeQRemoteWorker,
} from "@/services/practiceq-automation-orchestration";
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
import {
  canDispatchPharmacyAfterPayment,
  getPracticeQAutomationAfterPaymentDecision,
  isRealPharmacyEnabled,
} from "@/lib/payment-dispatch-safety";
import { normalizeProduct, tirzepatideProduct } from "@/data/products";
import { resolveReusableCheckoutIdentity } from "@/lib/checkout-identity-reuse";
import {
  buildTreatmentConsentText,
  CONSENT_VERSION,
  getRequestIp,
} from "@/lib/consent";
import { assertIdentityStorageReady, buildIdentityUploads } from "@/services/identity-storage";
import { getPublicBaseUrl } from "@/lib/public-url";
import type { Payment } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, token, cardNumber, expMonth, expYear, cvc, cardName, cardLast4, cardBrand, amount, patientData, orderData, productData, identityUploads, questionnaireAnswers, consentData } = body;
    const isReorder = body.isReorder === true || orderData?.isReorder === true;
    const reorderSourceOrderId = typeof body.reorderSourceOrderId === "string"
      ? body.reorderSourceOrderId
      : typeof orderData?.reorderSourceOrderId === "string"
        ? orderData.reorderSourceOrderId
        : "";
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

    const reorderSourceOrderForValidation = isReorder && reorderSourceOrderId
      ? await dbServer.orderDb.getById(reorderSourceOrderId).catch(() => null)
      : null;
    const reorderSkipsQuestionnaireValidation = Boolean(
      isReorder &&
      reorderSourceOrderForValidation &&
      reorderSourceOrderForValidation.patientId === order.patientId &&
      reorderSourceOrderForValidation.status !== "draft" &&
      reorderSourceOrderForValidation.status !== "cancelled"
    );

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
    const questions = await dbServer.questionDb.getAll().catch(() => []);
    const localQuestions = db.questionDb.getAll();
    const fallbackQuestions = ensurePracticeQRequiredQuestions(questions.length ? questions : (localQuestions.length ? localQuestions : seedQuestions));
    const questionById = new Map(fallbackQuestions.map((question) => [question.id, question]));

    // Persist submitted answers to Postgres so provider chart and PracticeQ worker can read them.
    // PracticeQ-required questions can come from the seed catalog even when the live DB catalog is stale,
    // so upsert those question rows before inserting answers under the FK.
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
      const submittedQuestions = submittedAnswerRows
        .flatMap((answer) => {
          const question = questionById.get(answer.questionId);
          return question ? [question] : [];
        });
      await Promise.all(submittedQuestions.map((question) => dbServer.questionDb.upsert(question).catch(() => question))).catch(() => {});
      await Promise.all(submittedAnswerRows.map((a) => dbServer.answerDb.create(a).catch(() => {}))).catch(() => {});
    }
    if (consentData?.signedName) {
      if (!consentData.signedName.trim() || consentData.signedName.trim().split(/\s+/).length < 2) {
        return NextResponse.json(
          { error: "Consent signature must include first and last name." },
          { status: 422 }
        );
      }
      await dbServer.consentDb.create({
        id: `consent_${orderId}`,
        orderId,
        consentText: buildTreatmentConsentText(effectivePatient),
        acknowledgments: consentData.acknowledgments ?? { telehealth: true, pharmacy: true, payment: true, privacy: true },
        signedName: String(consentData.signedName).trim(),
        signedAt: consentData.signedAt ?? new Date().toISOString(),
        ipAddress: getRequestIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
        consentVersion: CONSENT_VERSION,
      }).catch(() => {});
    }

    const answers = await dbServer.answerDb.getByOrder(orderId).catch(() => []);
    const fallbackAnswers = answers.length ? answers : (submittedAnswerRows.length ? submittedAnswerRows : db.answerDb.getByOrder(orderId));
    if (!reorderSkipsQuestionnaireValidation) {
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
    const submittedIdentityMedia = !!identityUploads?.licenseImageData && !!identityUploads?.selfieFrameData;

    if (submittedIdentityMedia && !isReorder) {
      try {
        assertIdentityStorageReady();
      } catch (error) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 503 }
        );
      }
    }

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

    // 7. Verify identity when patient submitted usable media. Returning patients with
    // a prior successful order reuse identity server-side so checkout cannot fall
    // back into a new upload reminder just because browser reorder metadata is absent.
    const reorderSourceOrder = reorderSourceOrderForValidation ?? (isReorder && reorderSourceOrderId
      ? await dbServer.orderDb.getById(reorderSourceOrderId).catch(() => null)
      : null);
    const patientOrdersForIdentity = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
    const identityCandidateOrders = reorderSourceOrder && !patientOrdersForIdentity.some((candidate) => candidate.id === reorderSourceOrder.id)
      ? [...patientOrdersForIdentity, reorderSourceOrder]
      : patientOrdersForIdentity;
    const reusableIdentity = resolveReusableCheckoutIdentity({
      patientId: patient.id,
      currentOrderId: orderId,
      isReorder,
      reorderSourceOrderId,
      patientOrders: identityCandidateOrders,
    });
    const checkoutIdentityReused = reusableIdentity.reused;
    const reusedIdentityStatus = reusableIdentity.reused ? reusableIdentity.identityStatus : "manual_approved";
    const identityUploadToken = checkoutIdentityReused ? undefined : (order.identityUploadToken ?? createIdentityUploadToken(orderId));
    const { uploads: submittedUploads, aiUploads: identityAiUploads } =
      submittedIdentityMedia && !checkoutIdentityReused
        ? await buildIdentityUploads({
            orderId,
            idImageData: identityUploads.licenseImageData,
            selfieFrameData: identityUploads.selfieFrameData,
            identityVideoData: identityUploads.identityVideoData,
          })
        : { uploads: [], aiUploads: [] };

    if (submittedUploads.length) {
      submittedUploads.forEach((upload) => db.uploadDb.create(upload));
      await Promise.all(submittedUploads.map((upload) => dbServer.uploadDb.create(upload).catch(() => upload)));
    }

    const identityAiResult = checkoutIdentityReused
      ? {
          status: reusedIdentityStatus as "verified" | "manual_approved",
          confidence: 1,
          summary: reusableIdentity.summary,
          flags: [] as string[],
          checkedAt: new Date().toISOString(),
        }
      : submittedUploads.length
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
    const hasSubmittedIdentity = !checkoutIdentityReused && submittedUploads.length > 0;
    const identityStatus = checkoutIdentityReused ? reusedIdentityStatus : hasSubmittedIdentity ? statusFromAiResult(identityAiResult) : "missing";
    const dispatchGate = getIdentityGate({ identityStatus });
    const pharmacyProvider = pharmacy.getPharmacyProvider();
    const realPharmacyEnabled = isRealPharmacyEnabled(pharmacyProvider);
    const canDispatchPharmacy = canDispatchPharmacyAfterPayment({
      identityCanDispatch: dispatchGate.canDispatch,
      paymentBypassed: bypassQuickBooksPayment,
      realPharmacyEnabled,
    });
    const pharmacyDispatchHeldForPayment = dispatchGate.canDispatch && !canDispatchPharmacy;

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
    if (!dispatchGate.canDispatch && !checkoutIdentityReused) {
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
    let updatedOrder = { ...orderForIntegrations, ...orderUpdates };
    const errors: string[] = [];
    const identityUploadUrl = identityUploadToken ? buildIdentityUploadUrl(getPublicBaseUrl(req), identityUploadToken) : "";
    const practiceQAutomationDecision = getPracticeQAutomationAfterPaymentDecision({
      identityCanDispatch: dispatchGate.canDispatch,
      checkoutIdentityReused,
    });
    let practiceQAutomationStatus: "queued" | "error" | "skipped" | "deferred" =
      practiceQAutomationDecision === "skip_reorder"
        ? "skipped"
        : practiceQAutomationDecision === "defer_identity"
          ? "deferred"
          : "queued";

    if (pharmacyDispatchHeldForPayment) {
      const holdMessage = "Real pharmacy dispatch held because payment was bypassed";
      errors.push(holdMessage);
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: pharmacyProvider === "appsheet" ? "appsheet" : "lifefile",
        action: holdMessage,
        orderId,
        patientId: patient.id,
        status: "error",
        details: { paymentBypassed: true, realPharmacyEnabled, pharmacyProvider },
        error: "A real pharmacy order requires a non-bypassed payment.",
      }).catch(() => {});
    }

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

    // 9. PracticeQ — queue browser automation only when the chart has enough
    // verified identity context to complete without repeated worker failures.
    if (practiceQAutomationDecision === "skip_reorder") {
      updatedOrder = { ...updatedOrder, practiceQStatus: "skipped" };
      db.orderDb.update(orderId, { practiceQStatus: "skipped" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "skipped" }).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "practiceq",
        action: "PracticeQ automation skipped for returning-patient reorder",
        orderId,
        patientId: patient.id,
        status: "success",
        details: { source: "payment_charge", reason: identityAiResult.summary },
      }).catch(() => {});
    } else if (practiceQAutomationDecision === "defer_identity") {
      updatedOrder = { ...updatedOrder, practiceQStatus: "pending" };
      db.orderDb.update(orderId, { practiceQStatus: "pending" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "pending" }).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "practiceq",
        action: "PracticeQ automation deferred pending identity verification",
        orderId,
        patientId: patient.id,
        status: "success",
        details: { source: "payment_charge", reason: identityAiResult.summary },
      }).catch(() => {});
    } else try {
      await queuePracticeQAutomationForOrder({
        order: updatedOrder,
        patient,
        source: "payment_charge",
      });
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
    if (canDispatchPharmacy) {
      const pharmacyIntegration = pharmacyProvider === "appsheet" ? "appsheet" : "lifefile";
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
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: pharmacyIntegration,
          action: pharmacyIntegration === "lifefile"
            ? "Pharmacy order submitted to LifeFile"
            : "Pharmacy order submitted",
          orderId,
          patientId: patient.id,
          status: "success",
          details: {
            lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
            provider: pharmacyIntegration,
            environment: process.env.LIFEFILE_ENVIRONMENT ?? "",
          },
        }).catch(() => {});
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
        checkoutIdentityReused
          ? "payment_received"
          : dispatchGate.canDispatch
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
      notes: pharmacyDispatchHeldForPayment
        ? "Auto-approved clinically, but pharmacy dispatch is held because payment is bypassed while real pharmacy is enabled."
        : dispatchGate.canDispatch
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
      orderStatus: canDispatchPharmacy && !errors.some((error) => error.startsWith("Pharmacy:"))
        ? "sent_to_pharmacy"
        : orderUpdates.status,
      pharmacyStatus: canDispatchPharmacy && !errors.some((error) => error.startsWith("Pharmacy:"))
        ? "submitted"
        : canDispatchPharmacy
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
