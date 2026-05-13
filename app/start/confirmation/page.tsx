"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import * as db from "@/lib/db";
import { getIntakeState } from "@/lib/intake-store";
import { CheckCircle, Package, ArrowRight } from "lucide-react";

export default function Confirmation() {
  const intakeState = getIntakeState();
  const [order, setOrder] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);

  useEffect(() => {
    if (intakeState.orderId && intakeState.patientId) {
      setOrder(db.orderDb.getById(intakeState.orderId));
      setPatient(db.patientDb.getById(intakeState.patientId));
    }
  }, []);

  if (!order || !patient) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading your confirmation...</p>
      </div>
    );
  }

  const isSentToPharmacy = order.status === "sent_to_pharmacy" || order.status === "processing" || order.status === "fulfilled" || order.status === "shipped" || order.status === "delivered";

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
              Our pharmacy will prepare and package your medication
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5 font-bold">2.</span>
              You&apos;ll receive a tracking number via SMS once it ships
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
