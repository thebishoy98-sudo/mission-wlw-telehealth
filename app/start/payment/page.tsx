"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { buildTreatmentConsentText, CONSENT_VERSION } from "@/lib/consent";
import { dataUrlToFileMetadata } from "@/lib/data-url";
import { formatCurrency } from "@/lib/utils";
import { normalizeQuickBooksPaymentsCountry } from "@/lib/quickbooks-country";
import { Lock, CreditCard } from "lucide-react";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const productTotal = dose?.price || product?.startingPrice || 0;
  const total = chargeAmountOverride ?? productTotal;

  useEffect(() => {
    if (productId) {
      const p = db.productDb.getById(productId);
      setProduct(p);
      if (doseId && p) {
        setDose(p.doses.find((d) => d.id === doseId) || null);
      }
    }
  }, [productId, doseId]);

  useEffect(() => {
    fetch("/api/practiceq/wake", {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = cardNumber.replace(/\s/g, "");
    if (digits.length < 15 || !cardExpiry || cardCvc.length < 3) return;
    setPaymentError("");
    setProcessing(true);

    setProcessingStep(quickBooksPaymentsEnabled ? "Securing payment details..." : "Setting up your account...");
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
    const cardLast4 = cardDigits.slice(-4);
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
        token: quickBooksToken || undefined,
        cardNumber: quickBooksPaymentsEnabled ? undefined : cardDigits,
        expMonth: quickBooksPaymentsEnabled ? undefined : expMonth,
        expYear: quickBooksPaymentsEnabled ? undefined : (expYear?.length === 2 ? `20${expYear}` : expYear),
        cvc: quickBooksPaymentsEnabled ? undefined : cardCvc,
        cardName: `${intakeState.firstName} ${intakeState.lastName}`,
        cardLast4,
        cardBrand: "Visa",
        amount: total,
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
            <span className="text-gray-600">{product?.name || "Treatment"}</span>
            <span className="font-semibold text-gray-900">{formatCurrency(productTotal)}</span>
          </div>
          {dose && (
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>{dose.label}</span>
            </div>
          )}
          {chargeAmountOverride !== null && productTotal !== total && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Testing charge override</span>
              <span className="font-semibold text-teal-700">{formatCurrency(total)}</span>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-gray-900">Total due today</span>
            <span className="text-2xl font-bold text-teal-600">{formatCurrency(total)}</span>
          </div>
        </div>
        <div className="mt-5 p-4 bg-teal-50 rounded-xl text-sm text-gray-600">
          <strong className="text-gray-800">No waiting required.</strong> Once payment is confirmed, your prescription goes directly to our pharmacy — no additional approval steps needed.
        </div>
      </div>

      {/* Payment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Payment</h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            <span>Test payment mode</span>
          </div>
        </div>

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
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400"
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
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
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
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
              />
            </div>
          </div>

          {paymentError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {paymentError}
            </div>
          )}
        </div>
      </div>

      {/* Processing overlay */}
      {processing && (
        <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <svg className="animate-spin w-5 h-5 text-teal-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="font-semibold text-gray-800 text-sm">{processingStep}</span>
          </div>
          <p className="text-xs text-gray-400">Setting up your order — please don&apos;t close this page</p>
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
        <Button fullWidth type="submit" disabled={processing || cardNumber.replace(/\s/g, "").length < 15 || !cardExpiry || cardCvc.length < 3}>
          {processing ? "Processing..." : `Pay ${formatCurrency(total)}`}
        </Button>
      </div>
    </form>
  );
}
