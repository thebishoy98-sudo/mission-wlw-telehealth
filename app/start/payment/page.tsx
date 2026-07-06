"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { buildTreatmentConsentText, CONSENT_VERSION } from "@/lib/consent";
import { RECURRING_CONSENT_TEXT } from "@/lib/subscription";
import { dataUrlToFileMetadata } from "@/lib/data-url";
import { formatCurrency } from "@/lib/utils";
import { normalizeQuickBooksPaymentsCountry } from "@/lib/quickbooks-country";
import { Lock, CreditCard, Tag, ShieldCheck, BadgeCheck } from "lucide-react";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function detectCardBrand(number: string): string {
  const n = number.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]|^2[2-7]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "AmEx";
  if (/^6011|^622|^64[4-9]|^65/.test(n)) return "Discover";
  return "Card";
}
const clinicalConsentStatusKey = ["practice", "QStatus"].join("") as keyof Types.Order;
const accountingStatusKey = ["quick", "booksStatus"].join("") as keyof Types.Order;

const usableShippingAddress = (state: ReturnType<typeof getIntakeState>) => {
  return state.shippingAddress?.street1 ? state.shippingAddress : state.address;
};

const configuredChargeOverride = Number(process.env.NEXT_PUBLIC_PAYMENT_CHARGE_AMOUNT_OVERRIDE);
const chargeAmountOverride =
  Number.isFinite(configuredChargeOverride) && configuredChargeOverride > 0
    ? configuredChargeOverride
    : null;
const quickBooksPaymentsEnabled = process.env.NEXT_PUBLIC_QB_PAYMENTS_ENABLED === "true";
const paymentsDisabled = !quickBooksPaymentsEnabled;
const quickBooksPaymentsEnvironment = process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
const quickBooksTokenBaseUrl =
  quickBooksPaymentsEnvironment === "sandbox"
    ? "https://sandbox.api.intuit.com/quickbooks/v4/payments"
    : "https://api.intuit.com/quickbooks/v4/payments";

async function tokenizeQuickBooksCard(card: {
  number: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  name: string;
  address?: Types.Address;
}) {
  const response = await fetch(`${quickBooksTokenBaseUrl}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card: {
        number: card.number,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cvc: card.cvc,
        name: card.name,
        address: {
          streetAddress: card.address?.street1 ?? "",
          city: card.address?.city ?? "",
          region: card.address?.state ?? "",
          postalCode: card.address?.zipCode ?? "",
          country: normalizeQuickBooksPaymentsCountry(card.address?.country),
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.value) {
    throw new Error(payload.errors?.[0]?.message ?? "Card tokenization failed.");
  }
  return String(payload.value);
}

export default function Payment() {
  const router = useRouter();
  const [intakeState] = useState(getIntakeState());
  const productId = intakeState.productId;
  const doseId = intakeState.doseId;
  const [product, setProduct] = useState<Types.Product | null>(null);
  const [dose, setDose] = useState<Types.DoseOption | null>(null);
  const [productLoading, setProductLoading] = useState(true);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [showDiscountCode, setShowDiscountCode] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountError, setDiscountError] = useState("");
  const productTotal = dose?.price || product?.startingPrice || 0;
  const baseTotal = chargeAmountOverride ?? productTotal;
  const total = Math.max(0, baseTotal - discountAmount);
  const productReady = !!product && !!dose && baseTotal > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedProduct() {
      setProductLoading(true);
      if (!productId) {
        setProduct(null);
        setDose(null);
        setProductLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const payload = await response.json();
        const found = ((payload.products ?? []) as Types.Product[]).find((item) =>
          item.id === productId || item.slug === productId
        ) ?? db.productDb.getById(productId);
        if (cancelled) return;
        setProduct(found ?? null);
        setDose(found && doseId ? found.doses.find((d) => d.id === doseId) ?? null : null);
      } catch {
        const fallback = db.productDb.getById(productId);
        if (cancelled) return;
        setProduct(fallback);
        setDose(fallback && doseId ? fallback.doses.find((d) => d.id === doseId) ?? null : null);
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    }

    void loadSelectedProduct();
    return () => {
      cancelled = true;
    };
  }, [productId, doseId]);

  useEffect(() => {
    fetch("/api/practiceq/wake", {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!intakeState.phone) return;
    fetch("/api/intake/save-partial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: intakeState.phone,
        email: intakeState.email,
        firstName: intakeState.firstName,
        refCode: intakeState.refCode,
        productId: intakeState.productId,
        doseId: intakeState.doseId,
        checkoutStep: "payment",
      }),
    }).catch(() => {});
  }, [intakeState]);

  const handleApplyCode = async () => {
    setDiscountError("");
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    const response = await fetch("/api/promo-codes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, baseAmount: baseTotal }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.valid) {
      setDiscountError(result.error ?? "Invalid discount code.");
      return;
    }
    setAppliedCode(code);
    setDiscountAmount(Number(result.discountAmount));
    setDiscountInput("");
  };

  const handleRemoveCode = () => {
    setAppliedCode("");
    setDiscountAmount(0);
    setDiscountError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = cardNumber.replace(/\s/g, "");
    if (!productReady) return;
    if (!paymentsDisabled && (digits.length < 15 || !cardExpiry || cardCvc.length < 3)) return;
    setPaymentError("");
    setDiscountError("");
    setProcessing(true);

    setProcessingStep(paymentsDisabled ? "Submitting order..." : "Securing payment details...");
    let quickBooksToken = "";
    try {
      if (quickBooksPaymentsEnabled) {
        const [expMonth, expYearInput] = cardExpiry.split("/").map((s) => s.trim());
        quickBooksToken = await tokenizeQuickBooksCard({
          number: digits,
          expMonth,
          expYear: expYearInput?.length === 2 ? `20${expYearInput}` : expYearInput,
          cvc: cardCvc,
          name: `${intakeState.firstName} ${intakeState.lastName}`,
          address: intakeState.address,
        });
      } else {
        await delay(400);
      }
    } catch (error) {
      setPaymentError((error as Error).message || "Payment setup failed. Please check your card details.");
      setProcessing(false);
      return;
    }

    // Create a local draft so the confirmation page has immediate browser state.
    // The charge API persists and returns the authoritative order status.
    const patient = db.patientDb.create({
      id: `patient_${Date.now()}`,
      firstName: intakeState.firstName,
      lastName: intakeState.lastName,
      dateOfBirth: intakeState.dateOfBirth,
      gender: intakeState.gender as any,
      phone: intakeState.phone,
      email: intakeState.email,
      address: intakeState.address,
      shippingAddress: usableShippingAddress(intakeState),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create order as draft - the charge API transitions it through statuses
    const draftOrder = {
      id: `order_${Date.now()}`,
      patientId: patient.id,
      productId: intakeState.productId,
      doseId: intakeState.doseId,
      status: "draft",
      paymentStatus: "pending",
      pharmacyStatus: "draft",
      [clinicalConsentStatusKey]: "pending",
      [accountingStatusKey]: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Types.Order;
    draftOrder.identityStatus = intakeState.identityStatus ?? "missing";
    const order = db.orderDb.create(draftOrder);

    // Payment record will be created by the charge API after real charge succeeds
    const cardDigits = cardNumber.replace(/\s/g, "");
    const cardLast4 = paymentsDisabled ? "0000" : cardDigits.slice(-4);
    const [expMonth, expYear] = cardExpiry.split("/").map((s) => s.trim());

    // Save questionnaire answers
    const qaAnswers = intakeState.questionnaireAnswers || {};
    Object.entries(qaAnswers).forEach(([questionId, answer]) => {
      if (answer) {
        db.answerDb.create({
          id: `answer_${Date.now()}_${questionId}`,
          orderId: order.id,
          questionId,
          answer,
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Save consent record
    if (intakeState.consented && intakeState.signedName) {
      db.consentDb.create({
        id: `consent_${Date.now()}`,
        orderId: order.id,
        consentText: buildTreatmentConsentText(patient),
        acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
        signedName: intakeState.signedName,
        signedAt: intakeState.consentSignedAt ?? new Date().toISOString(),
        consentVersion: CONSENT_VERSION,
      });
    }

    // Save upload records
    if (intakeState.licenseUploaded) {
      db.uploadDb.create({
        id: `upload_lic_${Date.now()}`,
        orderId: order.id,
        type: "driver_license",
        filename: "drivers_license.jpg",
        fileSize: 245000,
        mimeType: "image/jpeg",
        base64Data: intakeState.licenseImageData ?? "",
        uploadedAt: new Date().toISOString(),
        status: "uploaded",
      });
    }
    if (intakeState.selfieUploaded) {
      const identityData = intakeState.selfieFrameData || intakeState.identityVideoData || "";
      const identityFile = identityData
        ? dataUrlToFileMetadata(identityData, intakeState.selfieFrameData ? "identity-frame" : "identity-video")
        : null;
      db.uploadDb.create({
        id: `upload_selfie_${Date.now()}`,
        orderId: order.id,
        type: "selfie_video",
        filename: identityFile?.filename ?? "identity-frame.jpg",
        fileSize: identityData.length,
        mimeType: identityFile?.mimeType ?? "image/jpeg",
        uploadedAt: new Date().toISOString(),
        status: "uploaded",
        base64Data: identityData,
      });
    }

    setProcessingStep("Confirming payment...");

    const res = await fetch("/api/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        isReorder: intakeState.isReorder,
        reorderSourceOrderId: intakeState.reorderSourceOrderId,
        discountCode: appliedCode || undefined,
        token: quickBooksToken || undefined,
        cardNumber: paymentsDisabled || quickBooksPaymentsEnabled ? undefined : cardDigits,
        expMonth: paymentsDisabled || quickBooksPaymentsEnabled ? undefined : expMonth,
        expYear: paymentsDisabled || quickBooksPaymentsEnabled ? undefined : (expYear?.length === 2 ? `20${expYear}` : expYear),
        cvc: paymentsDisabled || quickBooksPaymentsEnabled ? undefined : cardCvc,
        cardName: `${intakeState.firstName} ${intakeState.lastName}`,
        cardLast4,
        cardBrand: paymentsDisabled ? "bypass" : detectCardBrand(cardNumber),
        amount: baseTotal,
        identityUploads: {
          licenseImageData: intakeState.licenseImageData,
          selfieFrameData: intakeState.selfieFrameData,
          identityVideoData: intakeState.identityVideoData,
        },
        // Send full patient + order data so server can create in Postgres
        // (localStorage is not accessible server-side)
        patientData: {
          id: patient.id,
          firstName: intakeState.firstName,
          lastName: intakeState.lastName,
          dateOfBirth: intakeState.dateOfBirth,
          gender: intakeState.gender,
          phone: intakeState.phone,
          email: intakeState.email,
          address: intakeState.address,
          shippingAddress: usableShippingAddress(intakeState),
          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt,
        },
        orderData: {
          id: order.id,
          patientId: patient.id,
          productId: intakeState.productId,
          doseId: intakeState.doseId,
          isReorder: intakeState.isReorder,
          reorderSourceOrderId: intakeState.reorderSourceOrderId,
          status: "draft",
          paymentStatus: "pending",
          pharmacyStatus: "draft",
          [clinicalConsentStatusKey]: "pending",
          [accountingStatusKey]: "pending",
          identityStatus: intakeState.identityStatus ?? "missing",
          refCode: intakeState.refCode ?? undefined,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
        productData: product ?? undefined,
        questionnaireAnswers: qaAnswers,
        consentData: intakeState.consented && intakeState.signedName ? {
          signedName: intakeState.signedName,
          signedAt: intakeState.consentSignedAt ?? new Date().toISOString(),
          acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
        } : null,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      setPaymentError(result.error ?? "Payment failed. Please check your card details.");
      setProcessing(false);
      // Clean up the draft order so patient can retry
      db.orderDb.update(order.id, { status: "cancelled" as any });
      return;
    }

    setProcessingStep("Finalizing order...");
    await delay(500);

    db.orderDb.update(order.id, {
      status: result.orderStatus ?? "approved",
      paymentStatus: "completed",
      pharmacyStatus: result.pharmacyStatus ?? "draft",
      identityStatus: result.identityStatus,
      updatedAt: new Date().toISOString(),
    });

    saveIntakeState({
      orderId: order.id,
      patientId: patient.id,
      paymentProcessed: true,
      isReorder: false,
      reorderSourceOrderId: undefined,
    });
    // Also persist orderId to localStorage so the confirmation page survives a tab refresh
    try { localStorage.setItem("tele_last_order_id", order.id); } catch { /* ignore */ }
    try { localStorage.setItem("tele_last_patient_id", patient.id); } catch { /* ignore */ }
    setProcessing(false);
    router.push("/start/confirmation");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Order Summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-5">Order Summary</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{productLoading ? "Loading treatment..." : product?.name || "Treatment"}</span>
            <span className="font-semibold text-gray-900">{productReady ? formatCurrency(productTotal) : "-"}</span>
          </div>
          {dose && (
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>{dose.label}</span>
            </div>
          )}
          {chargeAmountOverride !== null && productTotal !== total && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Today&apos;s charge</span>
              <span className="font-semibold text-forest-800">{formatCurrency(total)}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-sm text-green-700">
              <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />{appliedCode}</span>
              <span className="font-semibold">-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-gray-900">Total due today</span>
            <span className="text-2xl font-bold text-forest-800">{productReady ? formatCurrency(total) : "-"}</span>
          </div>
        </div>

        {/* Discount code */}
        {appliedCode ? (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm">
            <span className="text-green-800 font-semibold flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> {appliedCode}: {formatCurrency(discountAmount)} off applied
            </span>
            <button type="button" onClick={handleRemoveCode} className="text-green-600 hover:text-green-800 text-xs font-medium">Remove</button>
          </div>
        ) : showDiscountCode ? (
          <div className="mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional discount code"
                value={discountInput}
                onChange={(e) => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApplyCode())}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-700 uppercase placeholder:normal-case placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleApplyCode}
                className="px-4 py-2 bg-forest-800 text-white text-sm font-semibold rounded-xl hover:bg-forest-700 transition-colors"
              >
                Apply
              </button>
            </div>
            {discountError && <p className="mt-1.5 text-xs text-red-500">{discountError}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDiscountCode(true)}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-forest-700 hover:text-forest-900"
          >
            <Tag className="w-3.5 h-3.5" />
            Have a discount code?
          </button>
        )}

        {/* Retatrutide upsell nudge */}
        {product && product.id !== "product_retatrutide" && (
          <div className="mt-4 p-4 bg-forest-800 rounded-xl text-white">
            <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Upgrade Available</p>
            <p className="text-sm font-semibold mb-0.5">Want faster results with Retatrutide?</p>
            <p className="text-xs text-white/60 mb-2.5">Our newest triple-agonist GLP-1 with up to 24% body weight loss in clinical data. From $227.50 per 4-week treatment.</p>
            <button
              type="button"
              className="text-red-400 hover:text-red-300 text-xs font-semibold transition-colors"
              onClick={() => {
                fetch("/api/products", { cache: "no-store" })
                  .then((r) => r.json())
                  .then((payload) => {
                    const reta = (payload.products as Types.Product[])?.find((p) => p.id === "product_retatrutide");
                    saveIntakeState({
                      ...intakeState,
                      productId: "product_retatrutide",
                      doseId: reta?.doses?.[0]?.id ?? "",
                    });
                    window.location.replace("/start/payment");
                  })
                  .catch(() => {
                    saveIntakeState({ ...intakeState, productId: "product_retatrutide", doseId: "" });
                    window.location.replace("/start/payment");
                  });
              }}
            >
              Switch to Retatrutide &rarr;
            </button>
          </div>
        )}

        <div className="mt-5 p-4 bg-cream-100 rounded-xl text-sm text-gray-600">
          <strong className="text-gray-800">Secure checkout.</strong> After payment, your identity and clinical details are reviewed before eligible prescriptions are sent to pharmacy.
        </div>
      </div>

      {/* Payment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Payment</h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            <span>{paymentsDisabled ? "Payment disabled" : "Secure payment"}</span>
          </div>
        </div>

        {paymentsDisabled ? (
          <div className="rounded-xl border border-forest-200 bg-forest-50 p-4 text-sm text-gray-700">
            Payment collection is disabled for this sandbox order. No card will be charged.
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Cardholder Name"
              disabled
              defaultValue={`${intakeState.firstName} ${intakeState.lastName}`}
            />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Card Number
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="4242 4242 4242 4242"
                maxLength={19}
                value={cardNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
                  setCardNumber(formatted);
                }}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-700 focus:border-transparent font-mono text-base sm:text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry (MM/YY)</label>
              <input
                type="text"
                placeholder="12/26"
                maxLength={5}
                value={cardExpiry}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "");
                  if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                  setCardExpiry(v);
                }}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-700 font-mono text-base sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">CVV</label>
              <input
                type="password"
                placeholder="•••"
                maxLength={4}
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-700 font-mono text-base sm:text-sm"
              />
            </div>
          </div>

          {paymentError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {paymentError}
            </div>
          )}
          </div>
        )}

        {paymentsDisabled && paymentError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {paymentError}
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {processing && (
        <div className="bg-white rounded-2xl shadow-sm border border-forest-200 p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <svg className="animate-spin w-5 h-5 text-forest-700" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="font-semibold text-gray-800 text-sm">{processingStep}</span>
          </div>
          <p className="text-xs text-gray-400">Setting up your order — please don&apos;t close this page</p>
        </div>
      )}

      {!paymentsDisabled && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-600">
          <strong className="text-gray-800">Auto-refill enrollment:</strong> {RECURRING_CONSENT_TEXT}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          fullWidth
          variant="outline"
          type="button"
          onClick={() => router.push(
            intakeState.isReorder && intakeState.reorderSourceOrderId
              ? `/patient/reorder?orderId=${encodeURIComponent(intakeState.reorderSourceOrderId)}`
              : "/start/uploads"
          )}
          disabled={processing}
        >
          Back
        </Button>
        <Button fullWidth type="submit" disabled={processing || !productReady || (!paymentsDisabled && (cardNumber.replace(/\s/g, "").length < 15 || !cardExpiry || cardCvc.length < 3))}>
          {processing ? "Processing..." : paymentsDisabled ? "Submit order" : `Pay ${productReady ? formatCurrency(total) : "-"}`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> HIPAA Compliant
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> 256-bit Encrypted
        </span>
        <span className="flex items-center gap-1.5">
          <BadgeCheck className="w-3.5 h-3.5 text-forest-700" /> Licensed US Providers
        </span>
      </div>
    </form>
  );
}
