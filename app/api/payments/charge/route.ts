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
import { sql } from "@/lib/db.server";
import * as qbPayments from "@/services/quickbooks-payments";
import * as quickbooks from "@/services/quickbooks";
import * as pharmacy from "@/services/pharmacy";
import * as spruceServer from "@/services/spruce.server";
import { sendOrderSentToPharmacyMessage } from "@/services/order-notifications";
import { sendAdminNotification } from "@/services/admin-notifications";
import {
  queuePracticeQAutomationForOrder,
  wakePracticeQRemoteWorker,
} from "@/services/practiceq-automation-orchestration";
import { checkEligibility } from "@/lib/eligibility";
import { seedQuestions } from "@/data/seed-data";
import { buildIdentityUploadUrl, createIdentityUploadToken, getIdentityGate, statusFromAiResult } from "@/lib/identity";
import {
  buildPriorMedUploadUrl,
  createPriorMedUploadToken,
  getPriorMedGate,
  patientHasEstablishedHistory,
  requiresPriorMedProof,
} from "@/lib/prior-med";
import { evaluateOrderCadence, MIN_REORDER_INTERVAL_DAYS } from "@/lib/order-cadence";
import { getReorderReviewGate } from "@/lib/reorder-review";
import { generateId } from "@/lib/utils";
import type { PriorMedStatus, ReorderReviewStatus } from "@/types";
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
import { storeCardAndChargeStored, recordEnrollment, ensureSubscriptionForOrder } from "@/lib/subscription-enroll";
import {
  buildTreatmentConsentText,
  CONSENT_VERSION,
  doesSignatureMatchPatient,
  getRequestIp,
  patientLegalName,
} from "@/lib/consent";
import { assertIdentityStorageReady, buildIdentityUploads } from "@/services/identity-storage";
import { getPublicBaseUrl } from "@/lib/public-url";
import type { Payment } from "@/types";

class PaymentPersistenceError extends Error {
  status: number;

  constructor(operation: string, afterPayment = false) {
    super(
      afterPayment
        ? `Payment was processed, but ${operation} could not be saved. Please contact support with this order ID.`
        : `Order could not be saved before payment (${operation}). Please retry; no payment was submitted.`
    );
    this.name = "PaymentPersistenceError";
    this.status = afterPayment ? 500 : 503;
  }
}

const hasCanonicalDb = () => !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

async function requirePaymentPersistence<T>(
  operation: string,
  action: () => Promise<T>,
  options: { requireResult?: boolean; afterPayment?: boolean } = {}
): Promise<T> {
  try {
    const result = await action();
    if (options.requireResult && hasCanonicalDb() && result == null) {
      throw new Error("No persisted row returned.");
    }
    return result;
  } catch (error) {
    console.error(`Payment persistence failed during ${operation}:`, error);
    throw new PaymentPersistenceError(operation, options.afterPayment);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, token, cardNumber, expMonth, expYear, cvc, cardName, cardLast4, cardBrand, amount, patientData, orderData, productData, identityUploads, questionnaireAnswers, consentData } = body;
    const incomingDiscountCode = typeof body.discountCode === "string" ? body.discountCode.toUpperCase().trim() : "";
    const isReorder = body.isReorder === true || orderData?.isReorder === true;
    const reorderSourceOrderId = typeof body.reorderSourceOrderId === "string"
      ? body.reorderSourceOrderId
      : typeof orderData?.reorderSourceOrderId === "string"
        ? orderData.reorderSourceOrderId
        : "";
    const bypassQuickBooksPayment = shouldBypassQuickBooksPayment();
    const DISCOUNT_CODES: Record<string, { type: "flat" | "percent"; amount: number; singleUse: boolean }> = {
      SUMMER50: { type: "flat", amount: 50, singleUse: true },
    };
    let baseChargeAmount = bypassQuickBooksPayment ? 0.01 : getChargeAmount(amount);
    let appliedDiscountAmount = 0;
    let validatedDiscountCode = "";

    if (incomingDiscountCode && baseChargeAmount !== null) {
      const promo = DISCOUNT_CODES[incomingDiscountCode];
      if (!promo) {
        return NextResponse.json({ error: "Invalid discount code." }, { status: 400 });
      }
      // Check single-use: query integration_logs for prior use by this patient's phone
      if (promo.singleUse && patientData?.phone && process.env.POSTGRES_URL) {
        const { rows } = await sql`
          SELECT 1 FROM integration_logs
          WHERE action = 'discount_applied'
            AND details->>'code' = ${incomingDiscountCode}
            AND details->>'phone' = ${String(patientData.phone)}
          LIMIT 1
        `.catch(() => ({ rows: [] as any[] }));
        if (rows.length > 0) {
          return NextResponse.json({ error: "This discount code has already been used." }, { status: 400 });
        }
      }
      appliedDiscountAmount = promo.type === "flat"
        ? promo.amount
        : Math.floor((baseChargeAmount ?? 0) * promo.amount / 100);
      baseChargeAmount = Math.max(bypassQuickBooksPayment ? 0.01 : 0.50, (baseChargeAmount ?? 0) - appliedDiscountAmount);
      validatedDiscountCode = incomingDiscountCode;
    }

    const chargeAmount = baseChargeAmount;

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
        await requirePaymentPersistence("product upsert", () => dbServer.productDb.upsert(productData));
        persistedProduct =
          (await dbServer.productDb.getBySlug(productData.slug).catch(() => null)) ??
          (await dbServer.productDb.getById(productData.id).catch(() => null));
        if (hasCanonicalDb() && !persistedProduct) {
          throw new PaymentPersistenceError("product lookup");
        }
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
        persistedPatient = await requirePaymentPersistence(
          "patient create",
          () => dbServer.patientDb.create(patientData),
          { requireResult: true }
        );
      } else {
        persistedPatient = await requirePaymentPersistence(
          "patient update",
          () => dbServer.patientDb.update(persistedPatient!.id, {
            firstName: patientData.firstName,
            lastName: patientData.lastName,
            dateOfBirth: patientData.dateOfBirth,
            gender: patientData.gender,
            phone: patientData.phone,
            email: patientData.email,
            address: patientData.address,
            shippingAddress: patientData.shippingAddress?.street1 ? patientData.shippingAddress : patientData.address,
          }),
          { requireResult: true }
        );
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
      order = await requirePaymentPersistence(
        "order create",
        () => dbServer.orderDb.create(normalizedOrderData),
        { requireResult: true }
      );
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

    // Atomic duplicate-charge lock via conditional UPDATE (Postgres only).
    // First concurrent request wins the UPDATE; second gets rowCount=0 and returns 409.
    if (hasCanonicalDb()) {
      try {
        const lockResult = await sql`
          UPDATE orders SET status = 'processing' WHERE id = ${orderId} AND status = 'draft'
        `;
        if ((lockResult.rowCount ?? 0) === 0) {
          return NextResponse.json(
            { error: "Order already processed", orderStatus: order.status },
            { status: 409 }
          );
        }
      } catch {
        // Lock unavailable — soft check above still provides basic protection
      }
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
      await Promise.all(
        submittedQuestions.map((question) =>
          requirePaymentPersistence("question upsert", () => dbServer.questionDb.upsert(question))
        )
      );
      await Promise.all(
        submittedAnswerRows.map((a) =>
          requirePaymentPersistence("questionnaire answer create", () => dbServer.answerDb.create(a), {
            requireResult: true,
          })
        )
      );
    }
    if (!isReorder) {
      if (!consentData?.signedName || consentData.signedName.trim().split(/\s+/).length < 2) {
        return NextResponse.json(
          { error: "Consent signature must include first and last name." },
          { status: 422 }
        );
      }
      const signedName = String(consentData.signedName).trim();
      if (effectivePatient && !doesSignatureMatchPatient(signedName, effectivePatient)) {
        return NextResponse.json(
          { error: `Consent signature must match the patient name: ${patientLegalName(effectivePatient)}` },
          { status: 422 }
        );
      }
      await requirePaymentPersistence("consent create", () =>
        dbServer.consentDb.create({
          id: `consent_${orderId}`,
          orderId,
          consentText: buildTreatmentConsentText(effectivePatient),
          acknowledgments: consentData!.acknowledgments ?? { telehealth: true, pharmacy: true, payment: true, privacy: true },
          signedName,
          signedAt: consentData!.signedAt ?? new Date().toISOString(),
          ipAddress: getRequestIp(req),
          userAgent: req.headers.get("user-agent") ?? undefined,
          consentVersion: CONSENT_VERSION,
        }),
        { requireResult: true }
      );
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

    if (!patient && effectivePatient) {
      patient = effectivePatient;
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
    let chargeResult!: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
    // When we save a reusable card, keep its metadata to enroll the recurring plan.
    let enrollmentCardInfo: { qbCustomerId: string; qbCardId: string; cardLast4: string; cardBrand: string } | null = null;
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
      // Card-on-file save-then-charge is opt-in. Intuit's createFromToken consumes
      // the single-use token, so a failed stored-card charge cannot safely fall
      // back to reusing that token. The default path charges the token once and
      // enrolls without a saved card; refills then use the review + pay-link path.
      if (token && process.env.QB_CLIENT_ID && process.env.QB_SAVE_CARD_AT_CHECKOUT === "true") {
        try {
          const stored = await storeCardAndChargeStored({
            order,
            patient,
            amount: chargeAmount,
            cardToken: token,
            cardLast4,
            cardBrand,
          });
          chargeResult = stored.chargeResult;
          enrollmentCardInfo = {
            qbCustomerId: stored.qbCustomerId,
            qbCardId: stored.qbCardId,
            cardLast4: stored.cardLast4,
            cardBrand: stored.cardBrand,
          };
        } catch (storeErr: any) {
          await dbServer.integrationLogDb.create({
            id: generateId(),
            timestamp: new Date().toISOString(),
            integrationName: "quickbooks",
            action: "Card-on-file save failed — falling back to one-time charge",
            orderId,
            patientId: patient.id,
            status: "error",
            details: { amount: chargeAmount },
            error: storeErr?.message ?? String(storeErr),
          }).catch(() => {});
        }
      }

      if (!enrollmentCardInfo) {
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
    await requirePaymentPersistence("payment create", () => dbServer.paymentDb.create(payment), {
      requireResult: true,
      afterPayment: true,
    });

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
      await Promise.all(
        submittedUploads.map((upload) =>
          requirePaymentPersistence("identity upload create", () => dbServer.uploadDb.create(upload), {
            requireResult: true,
            afterPayment: true,
          })
        )
      );
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

    // 7b. Prior-GLP-1 proof gate — a non-starting dose ordered by a new patient
    // must be backed by proof they've taken GLP-1 before (their existing script),
    // which an admin approves before dispatch. Established/refill patients are exempt.
    const priorMedProofRequired = requiresPriorMedProof({
      product: productForIntegrations,
      doseId: persistedDose?.id ?? order.doseId,
      isRefill: !!order.isRefill,
      hasEstablishedHistory: patientHasEstablishedHistory(patientOrdersForIdentity, orderId),
    });
    const priorMedStatus: PriorMedStatus =
      order.priorMedStatus && order.priorMedStatus !== "not_required"
        ? order.priorMedStatus
        : priorMedProofRequired
          ? "pending_upload"
          : "not_required";
    const priorMedGate = getPriorMedGate({ priorMedStatus });
    const priorMedUploadToken = priorMedGate.canDispatch
      ? undefined
      : (order.priorMedUploadToken ?? createPriorMedUploadToken(orderId));
    const priorMedUploadUrl = priorMedUploadToken
      ? buildPriorMedUploadUrl(getPublicBaseUrl(req), priorMedUploadToken)
      : "";

    // 7c. Back-to-back reorder review — if the patient is ordering again too soon
    // after their last paid order, flag it for admin review (approve/reject)
    // rather than blocking. Subscription auto-refills are exempt.
    const cadence = order.isRefill || order.subscriptionId
      ? { tooSoon: false, daysSinceLast: null as number | null }
      : evaluateOrderCadence(patientOrdersForIdentity, { excludeOrderId: orderId });
    const reorderReviewStatus: ReorderReviewStatus | undefined =
      order.reorderReviewStatus === "approved"
        ? "approved"
        : cadence.tooSoon
          ? "flagged"
          : order.reorderReviewStatus;
    const reorderTooSoonDays = Math.max(0, Math.floor(cadence.daysSinceLast ?? 0));
    const reorderReviewReason = cadence.tooSoon
      ? `Reordered ${reorderTooSoonDays} day${reorderTooSoonDays === 1 ? "" : "s"} after last order (minimum ${MIN_REORDER_INTERVAL_DAYS}).`
      : undefined;
    const reorderGate = getReorderReviewGate({ reorderReviewStatus });

    // Combined clinical dispatch gate: identity AND prior-med AND reorder review.
    const combinedCanDispatch =
      dispatchGate.canDispatch && priorMedGate.canDispatch && reorderGate.canDispatch;

    const pharmacyProvider = pharmacy.getPharmacyProvider();
    const realPharmacyEnabled = isRealPharmacyEnabled(pharmacyProvider);
    const canDispatchPharmacy = canDispatchPharmacyAfterPayment({
      identityCanDispatch: combinedCanDispatch,
      paymentBypassed: bypassQuickBooksPayment,
      realPharmacyEnabled,
    });
    const pharmacyDispatchHeldForPayment = combinedCanDispatch && !canDispatchPharmacy;

    // 8. Update order status
    const orderUpdates = {
      status: combinedCanDispatch ? "approved" as const : "pending_review" as const,
      paymentStatus: "completed" as const,
      pharmacyStatus: "draft" as const,
      identityStatus,
      identityReason: identityAiResult.summary,
      identityAiResult,
      identityUploadToken,
      priorMedStatus,
      priorMedReason: priorMedProofRequired
        ? "Higher-than-starting dose ordered — prior GLP-1 prescription proof required."
        : undefined,
      priorMedUploadToken,
      reorderReviewStatus,
      reorderReviewReason,
      submittedAt: new Date().toISOString(),
    };
    db.orderDb.update(orderId, orderUpdates);
    await requirePaymentPersistence("order status update", () => dbServer.orderDb.update(orderId, orderUpdates), {
      requireResult: true,
      afterPayment: true,
    });
    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
    sendAdminNotification("order_received", {
      orderId,
      patientId: patient.id,
      patientName,
    }).catch(() => {});
    if (reorderReviewStatus === "flagged") {
      sendAdminNotification("reorder_review_needed", {
        orderId,
        patientId: patient.id,
        patientName,
        reason: reorderReviewReason,
      }).catch(() => {});
    }
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
        await sendOrderSentToPharmacyMessage(patient, orderId).catch(() => {});
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

    // 11. Spruce SMS — payment received / identity reminder / prior-med reminder.
    // Identity takes priority; once identity clears, a prior-med reminder is sent
    // (or admin resend) if the prior-GLP-1 proof gate is still blocking dispatch.
    try {
      let smsTemplate: string;
      let smsVariables: Record<string, string>;
      if (!dispatchGate.canDispatch) {
        smsTemplate = hasSubmittedIdentity ? "identity_review_received" : "identity_upload_reminder";
        smsVariables = { orderId, uploadUrl: identityUploadUrl };
      } else if (!priorMedGate.canDispatch) {
        smsTemplate = "prior_med_upload_reminder";
        smsVariables = { orderId, uploadUrl: priorMedUploadUrl };
      } else {
        // Fully clear, or only the back-to-back reorder review is holding dispatch
        // (an internal admin step — no patient action is required).
        smsTemplate = "payment_received";
        smsVariables = { orderId };
      }
      await spruceServer.sendMessage(patient, smsTemplate, smsVariables);
      logPhiDisclosure(patient.id, orderId, "spruce", auditCtx.actor);
    } catch (e) {
      errors.push(`Spruce SMS: ${(e as Error).message}`);
    }

    // 12. Provider review record
    const reviewRecord = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      status: combinedCanDispatch ? "approved" as const : "needs_more_info" as const,
      reviewedAt: combinedCanDispatch ? new Date().toISOString() : undefined,
      reviewedBy: combinedCanDispatch ? "system-auto" : undefined,
      notes: pharmacyDispatchHeldForPayment
        ? "Auto-approved clinically, but pharmacy dispatch is held because payment is bypassed while real pharmacy is enabled."
        : combinedCanDispatch
        ? "Auto-approved: patient passed eligibility and identity screening"
        : !dispatchGate.canDispatch
        ? `Payment collected. Pharmacy dispatch blocked until identity is approved. Upload link: ${identityUploadUrl}`
        : !priorMedGate.canDispatch
        ? `Payment collected. Pharmacy dispatch blocked until prior GLP-1 prescription proof is approved. Upload link: ${priorMedUploadUrl}`
        : `Payment collected. Back-to-back reorder flagged for admin review — ${reorderReviewReason ?? "ordered too soon since last order."}`,
      identityAiResult,
      identityReviewRequired: !dispatchGate.canDispatch,
    };
    db.providerReviewDb.create(reviewRecord);
    await dbServer.providerReviewDb.create(reviewRecord).catch(() => {});

    // 12b. Auto-enroll every buyer into the recurring 8-week program. When we saved
    // a reusable card, refills can auto-charge; otherwise the refill review sends a
    // pay-link. Either way the refill is HELD for a dose review at the 7-week mark.
    if (!bypassQuickBooksPayment && !order.isRefill) {
      try {
        if (enrollmentCardInfo) {
          await recordEnrollment({
            order: updatedOrder,
            patient,
            product: productForIntegrations,
            qbCustomerId: enrollmentCardInfo.qbCustomerId,
            qbCardId: enrollmentCardInfo.qbCardId,
            cardLast4: enrollmentCardInfo.cardLast4,
            cardBrand: enrollmentCardInfo.cardBrand,
          });
        } else {
          await ensureSubscriptionForOrder({ order: updatedOrder, patient });
        }
      } catch (e) {
        errors.push(`Subscription enroll: ${(e as Error).message}`);
      }
    }

    // 13. Trigger AI eligibility pre-screen in background (non-blocking)
    if (process.env.ANTHROPIC_API_KEY) {
      fetch(`${req.nextUrl.origin}/api/ai/eligibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.ADMIN_SECRET ? { "x-admin-secret": process.env.ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({ orderId }),
      }).catch(() => {}); // fire and forget
    }

    // Log discount usage for single-use enforcement
    if (validatedDiscountCode && patientData?.phone) {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "system",
        action: "discount_applied",
        patientId: patientData.id ?? "",
        orderId,
        status: "success",
        details: { code: validatedDiscountCode, phone: patientData.phone, discountAmount: appliedDiscountAmount },
      });
      if (process.env.POSTGRES_URL) {
        await sql`
          INSERT INTO integration_logs (id, timestamp, integration_name, action, patient_id, order_id, status, details)
          VALUES (${generateId()}, ${new Date().toISOString()}, 'discount', 'discount_applied', ${patientData.id ?? ""}, ${orderId}, 'success',
            ${JSON.stringify({ code: validatedDiscountCode, phone: patientData.phone, discountAmount: appliedDiscountAmount })}::jsonb)
        `.catch(() => {});
      }
    }

    // Mark partial intake as completed so abandonment SMS are suppressed
    if (process.env.POSTGRES_URL && patientData?.phone) {
      await sql`
        UPDATE partial_intakes SET completed = true, completed_at = NOW()
        WHERE phone = ${patientData.phone} AND completed = false
      `.catch(() => {});
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
      priorMedStatus,
      priorMedUploadUrl: priorMedGate.canDispatch ? undefined : priorMedUploadUrl,
      reorderReviewStatus,
      practiceQAutomationStatus,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    if (err instanceof PaymentPersistenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Payment charge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
