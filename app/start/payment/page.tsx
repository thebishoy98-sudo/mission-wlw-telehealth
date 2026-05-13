"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { formatCurrency } from "@/lib/utils";
import { Lock, CreditCard, CheckCircle } from "lucide-react";
import * as practiceqService from "@/services/practiceq";
import * as lifefileService from "@/services/lifefile";
import * as quickbooksService from "@/services/quickbooks";
import * as spruceService from "@/services/spruce";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Payment() {
  const router = useRouter();
  const [intakeState] = useState(getIntakeState());
  const [product, setProduct] = useState<Types.Product | null>(null);
  const [dose, setDose] = useState<Types.DoseOption | null>(null);
  const [cardLast4, setCardLast4] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");

  useEffect(() => {
    if (intakeState.productId) {
      const p = db.productDb.getById(intakeState.productId);
      setProduct(p);
      if (intakeState.doseId && p) {
        setDose(p.doses.find((d) => d.id === intakeState.doseId) || null);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardLast4) return;
    setProcessing(true);

    // PRODUCTION: Replace this with a call to your API route:
    //   POST /api/payments/charge  { token, amount, orderId }
    // The QB JS SDK tokenizes the card in the browser first.
    setProcessingStep("Processing payment...");
    await delay(1200);

    // Create patient
    const patient = db.patientDb.create({
      id: `patient_${Date.now()}`,
      firstName: intakeState.firstName,
      lastName: intakeState.lastName,
      dateOfBirth: intakeState.dateOfBirth,
      gender: intakeState.gender as any,
      phone: intakeState.phone,
      email: intakeState.email,
      address: intakeState.address,
      shippingAddress: intakeState.shippingAddress || intakeState.address,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const amount = dose?.price || product?.startingPrice || 0;

    // Create order — starts as pending_review for provider audit, will be auto-processed below
    const order = db.orderDb.create({
      id: `order_${Date.now()}`,
      patientId: patient.id,
      productId: intakeState.productId,
      doseId: intakeState.doseId,
      status: "pending_review",
      paymentStatus: "completed",
      pharmacyStatus: "draft",
      practiceQStatus: "pending",
      quickbooksStatus: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    });

    // Save payment as captured
    const payment = db.paymentDb.create({
      id: `payment_${Date.now()}`,
      orderId: order.id,
      patientId: patient.id,
      amount,
      currency: "USD",
      status: "completed",
      paymentMethod: "credit_card",
      cardLast4,
      cardBrand: "Visa",
      transactionId: `txn_${Date.now()}`,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    });

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
        consentText: "Patient consented to telehealth services and data collection.",
        acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
        signedName: intakeState.signedName,
        signedAt: new Date().toISOString(),
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
        base64Data: "",
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
        base64Data: "",
      });
    }

    // Create provider review record (for audit trail — provider can still view/mark chart)
    db.providerReviewDb.create({
      id: `review_${Date.now()}`,
      orderId: order.id,
      patientId: patient.id,
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: "Auto-processed",
      notes: "Automatically processed — patient passed eligibility screening.",
    });

    // ── AUTO-PROCESS: No explicit provider approval needed ──────────────────
    // Eligible patients go straight to pharmacy without waiting for manual review.

    setProcessingStep("Submitting to PracticeQ...");
    await delay(600);
    try { practiceqService.submitIntakePacket(order); } catch {}
    db.orderDb.update(order.id, { practiceQStatus: "submitted" });

    setProcessingStep("Creating invoice...");
    await delay(500);
    try {
      const invoiceId = quickbooksService.createInvoice(order, payment);
      quickbooksService.recordPayment(invoiceId, payment.amount);
      db.paymentDb.update(payment.id, { status: "completed", processedAt: new Date().toISOString() });
      db.orderDb.update(order.id, { quickbooksStatus: "invoiced" });
    } catch {}

    setProcessingStep("Sending to pharmacy...");
    await delay(700);
    try {
      lifefileService.createPharmacyOrder(order);
      db.orderDb.update(order.id, { pharmacyStatus: "submitted", status: "sent_to_pharmacy" });
    } catch {}

    setProcessingStep("Sending confirmation SMS...");
    await delay(400);
    try {
      spruceService.sendMessage(patient.id, "order_approved", {
        patientName: patient.firstName,
        orderId: order.id,
      });
      spruceService.scheduleReorderReminder(order.id, 30);
    } catch {}

    // Final log
    db.integrationLogDb.create({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: "Order auto-processed — PracticeQ, QuickBooks, Pharmacy, Spruce notified",
      orderId: order.id,
      patientId: patient.id,
      status: "success",
      details: { autoProcessed: true },
    });

    saveIntakeState({ orderId: order.id, patientId: patient.id, paymentProcessed: true });
    setProcessing(false);
    router.push("/start/confirmation");
  };

  const total = dose?.price || product?.startingPrice || 0;

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
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>{dose.label}</span>
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
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            Secure &amp; encrypted
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
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
                  e.target.value = formatted;
                  if (digits.length >= 4) {
                    setCardLast4(digits.slice(-4));
                  } else {
                    setCardLast4("");
                  }
                }}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Expiry (MM/YY)" placeholder="12/26" />
            <Input label="CVV" placeholder="•••" type="password" />
          </div>
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
        <Button fullWidth variant="outline" type="button" onClick={() => router.push("/start/uploads")} disabled={processing}>
          Back
        </Button>
        <Button fullWidth type="submit" disabled={processing || !cardLast4}>
          {processing ? "Processing..." : `Pay ${formatCurrency(total)}`}
        </Button>
      </div>
    </form>
  );
}
