"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { formatCurrency, generateId } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  RefreshCcw,
  CreditCard,
  ArrowLeft,
} from "lucide-react";

type Step = "select_dose" | "confirm_payment" | "success";

function ReorderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const orderId = searchParams.get("orderId") ?? "";
  const action = (searchParams.get("action") ?? "reorder") as
    | "reorder"
    | "increase_dose";

  const [step, setStep] = useState<Step>("select_dose");
  const [sourceOrder, setSourceOrder] = useState<Types.Order | null>(null);
  const [product, setProduct] = useState<Types.Product | null>(null);
  const [currentDose, setCurrentDose] = useState<Types.DoseOption | null>(null);
  const [selectedDoseId, setSelectedDoseId] = useState<string>("");
  const [newOrderId, setNewOrderId] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    const order = db.orderDb.getById(orderId);
    if (!order) return;
    setSourceOrder(order);

    const prod = db.productDb.getById(order.productId);
    if (!prod) return;
    setProduct(prod);

    const dose = prod.doses.find((d) => d.id === order.doseId);
    if (dose) setCurrentDose(dose);

    // Pre-select: same dose for reorder, next higher for increase
    if (action === "reorder") {
      setSelectedDoseId(order.doseId);
    } else {
      const idx = prod.doses.findIndex((d) => d.id === order.doseId);
      const nextIdx = idx < prod.doses.length - 1 ? idx + 1 : idx;
      setSelectedDoseId(prod.doses[nextIdx].id);
    }
  }, [orderId, action]);

  const selectedDose = product?.doses.find((d) => d.id === selectedDoseId);
  const isIncrease = selectedDose && currentDose && selectedDose.id !== currentDose.id;

  const availableDoses =
    action === "increase_dose"
      ? product?.doses.filter((d, i) => {
          const currentIdx = product.doses.findIndex(
            (dd) => dd.id === currentDose?.id
          );
          return i >= currentIdx;
        }) ?? []
      : product?.doses ?? [];

  const handleConfirmPayment = () => {
    if (!sourceOrder || !user?.patientId || !selectedDoseId) return;
    setProcessing(true);

    setTimeout(() => {
      const id = generateId();
      db.orderDb.create({
        id,
        patientId: user.patientId!,
        productId: sourceOrder.productId,
        doseId: selectedDoseId,
        status: "pending_review",
        paymentStatus: "completed",
        pharmacyStatus: "draft",
        practiceQStatus: "pending",
        quickbooksStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      });

      // Mock payment record
      db.paymentDb.create({
        id: generateId(),
        orderId: id,
        patientId: user.patientId!,
        amount: selectedDose?.price ?? 0,
        currency: "USD",
        status: "completed",
        paymentMethod: "credit_card",
        cardLast4: "4242",
        cardBrand: "Visa",
        transactionId: `txn_${generateId()}`,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      });

      setNewOrderId(id);
      setProcessing(false);
      setStep("success");
    }, 1200);
  };

  if (!sourceOrder || !product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="patient" />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500">Order not found.</p>
          <Link href="/patient" className="mt-4 inline-block">
            <Button>Back to portal</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="patient" />

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">

        {/* Back link */}
        {step !== "success" && (
          <Link
            href="/patient"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 mb-6"
          >
            <ArrowLeft size={15} className="mr-1" />
            Back to my orders
          </Link>
        )}

        {/* Step indicator */}
        {step !== "success" && (
          <div className="flex items-center gap-2 mb-8">
            {(["select_dose", "confirm_payment"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s
                      ? "bg-teal-600 text-white"
                      : step === "confirm_payment" && s === "select_dose"
                      ? "bg-teal-100 text-teal-700"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step === "confirm_payment" && s === "select_dose" ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    step === s ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {s === "select_dose" ? "Choose dose" : "Confirm & pay"}
                </span>
                {i < 1 && <ChevronRight size={14} className="text-gray-300 mx-1" />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 1: Select dose */}
        {step === "select_dose" && (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                {action === "increase_dose" ? (
                  <TrendingUp size={18} className="text-teal-600" />
                ) : (
                  <RefreshCcw size={18} className="text-teal-600" />
                )}
                <h1 className="text-2xl font-bold text-gray-900">
                  {action === "increase_dose" ? "Increase dosage" : "Reorder"}
                </h1>
              </div>
              <p className="text-sm text-gray-500">
                {product.name} &mdash; select your dose below
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {availableDoses.map((dose) => {
                const isCurrent = dose.id === currentDose?.id;
                const isSelected = dose.id === selectedDoseId;
                const priceDiff = currentDose
                  ? dose.price - currentDose.price
                  : 0;

                return (
                  <button
                    key={dose.id}
                    onClick={() => setSelectedDoseId(dose.id)}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                      isSelected
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {dose.label}
                          </span>
                          {isCurrent && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                              current
                            </span>
                          )}
                          {!isCurrent && action === "increase_dose" && (
                            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <TrendingUp size={10} />
                              Upgrade
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {dose.quantity} injections &bull; 1-month supply
                        </p>
                        {!isCurrent && priceDiff > 0 && (
                          <p className="text-xs text-teal-600 font-medium mt-1">
                            +{formatCurrency(priceDiff)}/mo vs. current dose
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(dose.price)}
                        </p>
                        <p className="text-xs text-gray-400">/month</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              fullWidth
              disabled={!selectedDoseId}
              onClick={() => setStep("confirm_payment")}
            >
              Continue
              <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        )}

        {/* STEP 2: Confirm payment */}
        {step === "confirm_payment" && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              Confirm your order
            </h1>

            <Card className="mb-4">
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Treatment</span>
                  <span className="font-medium text-gray-900">{product.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Dose</span>
                  <span className="font-medium text-gray-900">
                    {selectedDose?.label}
                  </span>
                </div>
                {isIncrease && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Previous dose</span>
                    <span className="text-gray-400 line-through">
                      {currentDose?.label}
                    </span>
                  </div>
                )}
                <div className="border-t pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-lg text-gray-900">
                    {formatCurrency(selectedDose?.price ?? 0)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <CreditCard size={18} className="text-gray-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Visa ending in 4242
                    </p>
                    <p className="text-xs text-gray-400">Card on file</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isIncrease && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
                <strong>Dose increase note:</strong> Your new dose will be
                reviewed by a licensed provider before being sent to the
                pharmacy. You&apos;ll be notified once approved.
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("select_dose")}
                disabled={processing}
              >
                <ArrowLeft size={15} className="mr-1" />
                Back
              </Button>
              <Button
                fullWidth
                onClick={handleConfirmPayment}
                disabled={processing}
              >
                {processing ? "Processing..." : `Confirm & pay ${formatCurrency(selectedDose?.price ?? 0)}`}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Success */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={32} className="text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isIncrease ? "Dose increase requested!" : "Order placed!"}
            </h1>
            <p className="text-gray-500 mb-2">
              {isIncrease
                ? "Your request to increase to"
                : "Your refill for"}{" "}
              <strong>{selectedDose?.label}</strong> has been submitted.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              A provider will review and approve your{" "}
              {isIncrease ? "dose increase" : "refill"} shortly. You&apos;ll
              receive an SMS update.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/patient">
                <Button variant="outline">Back to my orders</Button>
              </Link>
              <Link href="/status">
                <Button>Track this order</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReorderPage() {
  return (
    <ProtectedRoute requiredRole="patient">
      <ReorderContent />
    </ProtectedRoute>
  );
}
