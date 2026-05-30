"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import * as db from "@/lib/db";
import { getIntakeState } from "@/lib/intake-store";
import { CheckCircle, Package, ArrowRight } from "lucide-react";

type ConsentAutomationStatus = {
  available: boolean;
  status?: string;
  handoffUrl?: string;
  lastError?: string;
};

export default function Confirmation() {
  const intakeState = getIntakeState();
  const orderId = intakeState.orderId;
  const patientId = intakeState.patientId;
  const [order, setOrder] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [consentAutomation, setConsentAutomation] = useState<ConsentAutomationStatus | null>(null);

  useEffect(() => {
    if (orderId && patientId) {
      setOrder(db.orderDb.getById(orderId));
      setPatient(db.patientDb.getById(patientId));
    }
  }, [orderId, patientId]);

  useEffect(() => {
    if (!orderId || !patientId) return;

    let cancelled = false;
    const loadStatus = async () => {
      const response = await fetch(
        `/api/clinical-consent/automation/${encodeURIComponent(orderId)}?patientId=${encodeURIComponent(patientId)}`
      );
      if (!response.ok || cancelled) return;
      const payload = await response.json();
      setConsentAutomation(payload);
    };

    loadStatus();
    const timer = window.setInterval(loadStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId, patientId]);

  if (!order || !patient) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading your confirmation...</p>
      </div>
    );
  }

  const isSentToPharmacy =
    order.pharmacyStatus === "submitted" ||
    order.pharmacyStatus === "received" ||
    order.pharmacyStatus === "processing" ||
    order.pharmacyStatus === "fulfilled" ||
    order.pharmacyStatus === "shipped" ||
    order.pharmacyStatus === "delivered";
  const hasPharmacyIssue = order.pharmacyStatus === "error";

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 sm:p-10 text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">You&apos;re all set!</h1>
        <p className="text-gray-500 text-lg mb-8">
          {isSentToPharmacy
            ? "Your prescription has been sent directly to our pharmacy."
            : hasPharmacyIssue
              ? "Your payment is complete. Our team is reviewing the pharmacy submission."
            : "Your intake has been submitted and is being processed."}
        </p>

        <div className="bg-gray-50 rounded-xl p-5 text-left mb-6 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Order ID</span>
            <span className="font-mono font-semibold text-gray-800 text-xs">{order.id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Status</span>
            {isSentToPharmacy ? (
              <span className="font-semibold text-teal-600 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Sent to Pharmacy
              </span>
            ) : hasPharmacyIssue ? (
              <span className="font-semibold text-amber-600">Pharmacy Review</span>
            ) : (
              <span className="font-semibold text-blue-600">Processing</span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Submitted</span>
            <span className="text-gray-700">{new Date(order.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>

        <div className="bg-teal-50 border border-teal-100 rounded-xl p-5 text-left mb-8">
          <p className="text-sm font-semibold text-gray-800 mb-3">What happens next?</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5 font-bold">1.</span>
              {consentAutomation?.handoffUrl
                ? "Complete the final clinical consent/signature step"
                : isSentToPharmacy
                  ? "Our pharmacy will prepare and package your medication"
                  : "We are preparing your clinical consent session"}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5 font-bold">2.</span>
              {isSentToPharmacy ? "You'll receive a tracking number via text once it ships" : "Provider review starts after your consent is submitted"}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5 font-bold">3.</span>
              Free overnight delivery to your door
            </li>
          </ul>
        </div>

        <p className="text-sm text-gray-400 mb-8">
          Updates will be sent to <strong className="text-gray-600">{patient.email}</strong> and <strong className="text-gray-600">{patient.phone}</strong>
        </p>

        <div className="flex flex-col gap-3">
          {consentAutomation?.handoffUrl && (
            <a href={consentAutomation.handoffUrl} target="_blank" rel="noopener noreferrer">
              <Button fullWidth>
                Finish Consent <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </a>
          )}
          {consentAutomation?.status === "running" && (
            <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              Preparing your consent session. This page will update automatically.
            </div>
          )}
          {consentAutomation?.status === "failed" && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              We could not prepare your consent automatically. Our team will contact you to finish it.
            </div>
          )}
          <Link href="/status">
            <Button fullWidth>
              Track My Order <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link href="/">
            <Button fullWidth variant="ghost">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
