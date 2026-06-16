"use client";

/**
 * Pay-only page for an existing order, opened from an admin-issued signed
 * payment link. Re-collects card details ONLY - intake, questionnaire,
 * consent, and identity from the original checkout are reused server-side.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";
import { RECURRING_CONSENT_TEXT } from "@/lib/subscription";
import { Lock, CreditCard, ShieldCheck, BadgeCheck, CheckCircle2, RefreshCw } from "lucide-react";

const quickBooksPaymentsEnabled = process.env.NEXT_PUBLIC_QB_PAYMENTS_ENABLED === "true";
const quickBooksTokenBaseUrl =
  process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT === "sandbox"
    ? "https://sandbox.api.intuit.com/quickbooks/v4/payments"
    : "https://api.intuit.com/quickbooks/v4/payments";

async function tokenizeCard(card: { number: string; expMonth: string; expYear: string; cvc: string; name: string }) {
  const response = await fetch(`${quickBooksTokenBaseUrl}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.value) {
    throw new Error(payload.errors?.[0]?.message ?? "Card tokenization failed.");
  }
  return String(payload.value);
}

type OrderSummary = {
  orderId: string;
  orderNumber: string;
  patientFirstName: string;
  cardholderName: string;
  productName: string;
  doseLabel: string;
  amount: number | null;
  eligible: boolean;
  reason?: string;
};

export default function PayExistingOrder() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params?.token ?? ""));
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paid, setPaid] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enroll, setEnroll] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/payments/retry-order?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "This payment link is not valid.");
        setSummary(payload as OrderSummary);
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, [token]);

  const cardDigits = cardNumber.replace(/\s/g, "");
  const cardReady = cardDigits.length >= 15 && !!cardExpiry && cardCvc.length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary?.eligible || !cardReady || processing) return;
    setPaymentError("");
    setProcessing(true);

    try {
      const [expMonth, expYearInput] = cardExpiry.split("/").map((s) => s.trim());
      const expYear = expYearInput?.length === 2 ? `20${expYearInput}` : expYearInput;
      let cardToken = "";
      if (quickBooksPaymentsEnabled) {
        cardToken = await tokenizeCard({
          number: cardDigits,
          expMonth,
          expYear,
          cvc: cardCvc,
          name: summary.cardholderName,
        });
      }

      const response = await fetch("/api/payments/retry-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          cardToken: cardToken || undefined,
          cardName: summary.cardholderName,
          cardLast4: cardDigits.slice(-4),
          enrollSubscription: enroll && !!cardToken,
          recurringConsent: enroll && !!cardToken,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Payment failed. Please check your card details.");
      }
      setEnrolled(!!result.enrolled);
      setPaid(true);
    } catch (error) {
      setPaymentError((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="mt-1 text-sm text-gray-500">Secure payment for your existing Mission WLW order.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            Loading your order...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            {loadError}
          </div>
        ) : paid ? (
          <div className="rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h2 className="mt-3 text-xl font-bold text-gray-900">Payment received</h2>
            <p className="mt-2 text-sm text-gray-600">
              Thank you{summary?.patientFirstName ? `, ${summary.patientFirstName}` : ""}! Your order is now
              processing. We&apos;ll text you with updates and next steps.
            </p>
            {enrolled && (
              <p className="mt-3 rounded-xl bg-forest-50 px-4 py-3 text-xs text-forest-800">
                You&apos;re set up for automatic refills every 8 weeks. We&apos;ll text you about a week before each
                order so there&apos;s never a gap — reply STOP anytime to cancel.
              </p>
            )}
          </div>
        ) : summary && !summary.eligible ? (
          <div className="rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h2 className="mt-3 text-xl font-bold text-gray-900">
              {summary.reason === "already_paid" ? "This order is already paid" : "Payment already in progress"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              No additional payment is needed. If you have questions, reply to our text or contact support.
            </p>
          </div>
        ) : summary ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{summary.productName}</span>
                  <span className="font-semibold text-gray-900">
                    {summary.amount !== null ? formatCurrency(summary.amount) : "-"}
                  </span>
                </div>
                {summary.doseLabel && <p className="text-xs text-gray-400">{summary.doseLabel}</p>}
                <p className="text-xs text-gray-400">Order #{summary.orderNumber}</p>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="font-semibold text-gray-900">Total due today</span>
                  <span className="text-2xl font-bold text-forest-800">
                    {summary.amount !== null ? formatCurrency(summary.amount) : "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Payment</h2>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Lock className="h-3 w-3" />
                  <span>Secure payment</span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Card Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="4242 4242 4242 4242"
                      maxLength={19}
                      value={cardNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        setCardNumber(digits.replace(/(.{4})/g, "$1 ").trim());
                      }}
                      className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 font-mono text-base tracking-widest focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-700 sm:text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Expiry (MM/YY)</label>
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
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-base focus:outline-none focus:ring-2 focus:ring-forest-700 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">CVV</label>
                    <input
                      type="password"
                      placeholder="•••"
                      maxLength={4}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-base focus:outline-none focus:ring-2 focus:ring-forest-700 sm:text-sm"
                    />
                  </div>
                </div>
                {paymentError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {paymentError}
                  </div>
                )}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-forest-100 bg-forest-50/50 p-4">
              <input
                type="checkbox"
                checked={enroll}
                onChange={(e) => setEnroll(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-forest-700 focus:ring-forest-700"
              />
              <span className="text-xs leading-relaxed text-gray-600">
                <span className="mb-0.5 flex items-center gap-1.5 font-semibold text-forest-800">
                  <RefreshCw className="h-3.5 w-3.5" /> Save my card &amp; keep my treatment on track
                </span>
                {RECURRING_CONSENT_TEXT}
              </span>
            </label>

            <Button fullWidth type="submit" disabled={processing || !cardReady || summary.amount === null}>
              {processing
                ? "Processing..."
                : `Pay ${summary.amount !== null ? formatCurrency(summary.amount) : ""}`}
            </Button>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-500" /> HIPAA Compliant
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> 256-bit Encrypted
              </span>
              <span className="flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-forest-700" /> Licensed US Providers
              </span>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
