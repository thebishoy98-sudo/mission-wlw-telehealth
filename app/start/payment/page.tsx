"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { formatCurrency } from "@/lib/utils";
import { resolveChargeAmount } from "@/lib/payment-amount";
import { Lock, CreditCard } from "lucide-react";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const usableShippingAddress = (state: ReturnType<typeof getIntakeState>) => {
  return state.shippingAddress?.street1 ? state.shippingAddress : state.address;
};

declare global {
  interface Window {
    intuit?: {
      ipp: {
        payments: {
          create: (config: { environment: string; appKey: string }) => {
            card: () => {
              mount: (selector: string) => void;
              tokenize: () => Promise<{ token: string; errors?: Array<{ message: string }> }>;
              unmount?: () => void;
              on: (event: string, cb: () => void) => void;
            };
          };
        };
      };
    };
  }
}

export default function Payment() {
  const router = useRouter();
  const [intakeState] = useState(getIntakeState());
  const [product, setProduct] = useState<Types.Product | null>(null);
  const [dose, setDose] = useState<Types.DoseOption | null>(null);
  // Raw card fields — used only when QB Payments JS is not configured
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [productLoading, setProductLoading] = useState(true);
  const [qbCardReady, setQbCardReady] = useState(false);
  const cardRef = useRef<any>(null);

  const appKey = process.env.NEXT_PUBLIC_QB_PAYMENTS_APP_KEY;
  const useQBTokenizer = !!appKey;
  const paymentsReady =
    useQBTokenizer ||
    process.env.NEXT_PUBLIC_ALLOW_RAW_PAYMENT_FORM === "true";

  // Load Intuit QB Payments JS and mount hosted card fields
  useEffect(() => {
    if (!useQBTokenizer) return;
    const script = document.createElement("script");
    script.src = "https://js.intuit.com/v2/ui/payments.js";
    script.async = true;
    script.onload = () => {
      try {
        const client = window.intuit!.ipp.payments.create({
          environment: process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT ?? "production",
          appKey: appKey!,
        });
        const card = client.card();
        card.mount("#intuit-card-element");
        card.on("ready", () => setQbCardReady(true));
        cardRef.current = card;
      } catch (err) {
        console.error("QB Payments JS init error:", err);
      }
    };
    document.head.appendChild(script);
    return () => {
      cardRef.current?.unmount?.();
      script.remove();
    };
  }, [appKey, useQBTokenizer]);

  useEffect(() => {
    if (intakeState.productId) {
      setProductLoading(true);
      fetch("/api/products", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          const p = (payload.products ?? []).find((item: Types.Product) => item.id === intakeState.productId) ?? null;
          setProduct(p);
          if (intakeState.doseId && p) {
            setDose(p.doses.find((d) => d.id === intakeState.doseId) || null);
          }
        })
        .catch(() => setProduct(null))
        .finally(() => setProductLoading(false));
    } else {
      setProductLoading(false);
    }
  }, [intakeState.productId, intakeState.doseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentsReady) {
      setPaymentError("Online payments are not configured. Please contact support to complete your order.");
      return;
    }
    if (total <= 0) {
      setPaymentError("Treatment price is still loading. Please wait a moment, then try again.");
      return;
    }
    if (!useQBTokenizer) {
      const digits = cardNumber.replace(/\s/g, "");
      if (digits.length < 15 || !cardExpiry || cardCvc.length < 3) return;
    }

    setPaymentError("");
    setProcessing(true);

    const now = Date.now();
    const patientId = intakeState.patientId || `patient_${now}`;
    const orderId = intakeState.orderId || `order_${now}`;
    const createdAt = new Date().toISOString();

    setProcessingStep("Setting up your account...");
    await delay(400);

    const patient = db.patientDb.create({
      id: patientId,
      firstName: intakeState.firstName,
      lastName: intakeState.lastName,
      dateOfBirth: intakeState.dateOfBirth,
      gender: intakeState.gender as any,
      phone: intakeState.phone,
      email: intakeState.email,
      address: intakeState.address,
      shippingAddress: usableShippingAddress(intakeState),
      createdAt,
      updatedAt: createdAt,
    });

    const order = db.orderDb.create({
      id: orderId,
      patientId: patient.id,
      productId: intakeState.productId,
      doseId: intakeState.doseId,
      status: "draft",
      paymentStatus: "pending",
      pharmacyStatus: "draft",
      practiceQStatus: "pending",
      quickbooksStatus: "pending",
      createdAt,
      updatedAt: createdAt,
    });
    saveIntakeState({ orderId: order.id, patientId: patient.id });

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

    if (intakeState.consented && intakeState.signedName) {
      db.consentDb.create({
        id: `consent_${Date.now()}`,
        orderId: order.id,
        consentText: "Patient consented to telehealth services and data collection.",
        acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
        signedName: intakeState.signedName,
        signedAt: new Date().toISOString(),
      });
    }

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
      db.uploadDb.create({
        id: `upload_selfie_${Date.now()}`,
        orderId: order.id,
        type: "selfie_video",
        filename: "selfie_video.mp4",
        fileSize: 8500000,
        mimeType: "video/mp4",
        uploadedAt: new Date().toISOString(),
        status: "uploaded",
        base64Data: intakeState.selfieFrameData ?? "",
      });
    }

    // Tokenize card via QB Payments JS or use raw fields
    let token: string | undefined;
    let cardLast4: string;
    let rawCardFields: { cardNumber?: string; expMonth?: string; expYear?: string; cvc?: string } = {};

    if (useQBTokenizer && cardRef.current) {
      setProcessingStep("Securing card details...");
      try {
        const result = await cardRef.current.tokenize();
        if (result.errors?.length) throw new Error(result.errors[0]?.message ?? "Card tokenization failed");
        token = result.token;
        cardLast4 = "****";
      } catch (err: any) {
        setPaymentError(err.message ?? "Card tokenization failed. Please check your card details and try again.");
        setProcessing(false);
        db.orderDb.update(order.id, { status: "cancelled" as any });
        return;
      }
    } else {
      const digits = cardNumber.replace(/\s/g, "");
      cardLast4 = digits.slice(-4);
      const [expMonth, expYear] = cardExpiry.split("/").map((s) => s.trim());
      rawCardFields = {
        cardNumber: digits,
        expMonth,
        expYear: expYear?.length === 2 ? `20${expYear}` : expYear,
        cvc: cardCvc,
      };
    }

    setProcessingStep("Charging card via QuickBooks Payments...");

    const res = await fetch("/api/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        token,
        ...rawCardFields,
        cardName: `${intakeState.firstName} ${intakeState.lastName}`,
        cardLast4,
        cardBrand: token ? "unknown" : "Visa",
        amount: total,
        identityUploads: {
          licenseImageData: intakeState.licenseImageData,
          selfieFrameData: intakeState.selfieFrameData,
          identityVideoData: intakeState.identityVideoData,
        },
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
          status: "draft",
          paymentStatus: "pending",
          pharmacyStatus: "draft",
          practiceQStatus: "pending",
          quickbooksStatus: "pending",
          identityStatus: "missing",
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
        productData: product ?? undefined,
        questionnaireAnswers: intakeState.questionnaireAnswers || {},
        consentData: intakeState.consented && intakeState.signedName
          ? {
              signedName: intakeState.signedName,
              signedAt: new Date().toISOString(),
              acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
            }
          : undefined,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      setPaymentError(result.error ?? "Payment failed. Please check your card details.");
      setProcessing(false);
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

    saveIntakeState({ orderId: order.id, patientId: patient.id, paymentProcessed: true });
    setProcessing(false);
    router.push("/start/confirmation");
  };

  const total = dose?.price || product?.startingPrice || 0;
  const dueToday = resolveChargeAmount(total, process.env.NEXT_PUBLIC_PAYMENT_CHARGE_AMOUNT_OVERRIDE);
  const isChargeOverride = dueToday !== total;

  const rawCardValid =
    cardNumber.replace(/\s/g, "").length >= 15 && !!cardExpiry && cardCvc.length >= 3;
  const submitDisabled =
    !paymentsReady ||
    productLoading ||
    total <= 0 ||
    processing ||
    (useQBTokenizer ? !qbCardReady : !rawCardValid);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Order Summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-5">Order Summary</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{product?.name || "Treatment"}</span>
            <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {dose && (
            <div className="space-y-1 text-xs text-gray-500">
              <p>{dose.label}</p>
              {dose.patientDescription && <p>{dose.patientDescription}</p>}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-gray-900">Total due today</span>
            <span className="text-2xl font-bold text-teal-600">{formatCurrency(dueToday)}</span>
          </div>
        </div>
        {isChargeOverride && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Test checkout mode is active. Your card will only be charged {formatCurrency(dueToday)} today.
          </div>
        )}
        <div className="mt-5 p-4 bg-teal-50 rounded-xl text-sm text-gray-600">
          <strong className="text-gray-800">No waiting required.</strong> Once payment is confirmed, your prescription goes directly to our pharmacy - no additional approval steps needed.
        </div>
      </div>

      {/* Payment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Payment</h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            <span>Secured by QuickBooks Payments</span>
          </div>
        </div>
        <p className="mb-4 text-xs leading-5 text-gray-500">
          Payment processing services are provided by Intuit Payments Inc. Card details are used only to process this
          transaction.
        </p>

        {!paymentsReady && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Online payments are not configured for this environment. We need the Intuit client payment app key before this checkout can take live card payments.
          </div>
        )}
        {paymentsReady && productLoading && (
          <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-800">
            Loading treatment price...
          </div>
        )}

        <div className="space-y-4">
          <Input
            label="Cardholder Name"
            disabled
            defaultValue={`${intakeState.firstName} ${intakeState.lastName}`}
          />

          {useQBTokenizer ? (
            /* Intuit Hosted Payment Fields — card data never touches our server */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Card Details</label>
              <div
                id="intuit-card-element"
                className="w-full border border-gray-200 rounded-xl overflow-hidden"
                style={{ minHeight: 120 }}
              />
              {!qbCardReady && paymentsReady && (
                <p className="text-xs text-gray-400 mt-1.5">Loading secure card fields...</p>
              )}
            </div>
          ) : (
            /* Raw card inputs — fallback for dev/non-QB environments */
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Card Number
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="1111 1111 1111 1111"
                    maxLength={19}
                    disabled={!paymentsReady}
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
                    disabled={!paymentsReady}
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
                    disabled={!paymentsReady}
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                  />
                </div>
              </div>
            </>
          )}

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
          <p className="text-xs text-gray-400">Setting up your order - please don&apos;t close this page</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button fullWidth variant="outline" type="button" onClick={() => router.push("/start/uploads")} disabled={processing}>
          Back
        </Button>
        <Button fullWidth type="submit" disabled={submitDisabled}>
          {processing ? "Processing..." : `Pay ${formatCurrency(dueToday)}`}
        </Button>
      </div>
    </form>
  );
}
