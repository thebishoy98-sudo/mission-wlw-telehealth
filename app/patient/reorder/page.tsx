"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { saveIntakeState } from "@/lib/intake-store";
import { formatDoseOptionLabel, formatDoseOptionSummary } from "@/lib/product-dose";
import type { Order, Patient, Product } from "@/types";

type ReorderData = {
  patient: Patient;
  order: Order;
  product: Product | null;
  questionnaireAnswers: Record<string, string>;
};

const reusableIdentityStatus = (status: Order["identityStatus"]) =>
  status === "verified" || status === "manual_approved" ? status : "manual_approved";

function ReorderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const [data, setData] = useState<ReorderData | null>(null);
  const [selectedDose, setSelectedDose] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) {
      setError("Choose an order to reorder.");
      return;
    }

    let cancelled = false;
    fetch(`/api/patient/reorder/${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Could not load this reorder.");
        return payload as ReorderData;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        const doseIds = payload.product?.doses.map((dose) => dose.id) ?? [];
        setSelectedDose(doseIds.includes(payload.order.doseId) ? payload.order.doseId : doseIds[0] ?? "");
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handleCheckout = () => {
    if (!data || !selectedDose) return;
    const shippingAddress = data.patient.shippingAddress?.street1
      ? data.patient.shippingAddress
      : data.patient.address;

    saveIntakeState({
      patientId: data.patient.id,
      firstName: data.patient.firstName,
      lastName: data.patient.lastName,
      dateOfBirth: data.patient.dateOfBirth,
      gender: data.patient.gender,
      phone: data.patient.phone,
      email: data.patient.email,
      address: data.patient.address,
      shippingAddress,
      productId: data.product?.id ?? data.order.productId,
      doseId: selectedDose,
      questionnaireAnswers: data.questionnaireAnswers,
      consentAcknowledged: false,
      signedName: "",
      consented: false,
      consentSignedAt: undefined,
      licenseUploaded: false,
      selfieUploaded: false,
      licenseImageData: undefined,
      selfieFrameData: undefined,
      identityVideoData: undefined,
      paymentProcessed: false,
      orderId: undefined,
      isReorder: true,
      reorderSourceOrderId: data.order.id,
      identityStatus: reusableIdentityStatus(data.order.identityStatus),
      identityAiResult: undefined,
    });
    router.push("/start/payment");
  };

  const doseOptions = data?.product?.doses ?? [];
  const selectedDoseOption = doseOptions.find((dose) => dose.id === selectedDose);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="patient" />
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reorder</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Choose your dose and continue directly to checkout.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!data && !error && (
              <div className="py-8 text-center text-sm text-gray-500">Loading reorder...</div>
            )}

            {data && (
              <>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">{data.product?.name ?? "Treatment"}</p>
                  <p className="mt-1 text-xs text-gray-500">Previous order {data.order.id.slice(-8)}</p>
                </div>

                <Select
                  label="Prescription option"
                  value={selectedDose}
                  onChange={(event) => setSelectedDose(event.target.value)}
                  options={doseOptions.map((dose) => ({
                    value: dose.id,
                    label: formatDoseOptionLabel(dose),
                  }))}
                />

                {selectedDoseOption && (
                  <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-gray-700">
                    Checkout will use {formatDoseOptionSummary(selectedDoseOption)}.
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button fullWidth variant="outline" onClick={() => router.push("/patient")}>
                Back to Order History
              </Button>
              <Button fullWidth onClick={handleCheckout} disabled={!data || !selectedDose}>
                Continue to Checkout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ReorderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ReorderContent />
    </Suspense>
  );
}
