"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, CheckCircle, ClipboardCheck, CreditCard, Eye, FileText, X } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from "@/lib/utils";
import type {
  ConsentRecord,
  Order,
  Patient,
  Payment,
  PharmacyOrder,
  Product,
  ProviderReview,
  Question,
  QuestionnaireAnswer,
  Upload,
} from "@/types";

interface ChartState {
  patient: Patient;
  orders: Order[];
  selectedOrder: Order;
  product: Product | null;
  questionnaire: Question[];
  answers: QuestionnaireAnswer[];
  consent: ConsentRecord | null;
  uploads: Upload[];
  payment: Payment | null;
  pharmacyOrder: PharmacyOrder | null;
  review: ProviderReview | null;
}

export default function PatientDetail() {
  const params = useParams();
  const router = useRouter();
  const patientId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [chart, setChart] = useState<ChartState | null>(null);
  const [providerNotes, setProviderNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approvalSteps, setApprovalSteps] = useState<{ label: string; status: "pending" | "done" | "running" }[]>([]);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);

  useEffect(() => {
    if (!patientId) return;

    let cancelled = false;
    async function loadPatientChart() {
      setLoadError("");
      try {
        const res = await fetch(`/api/provider/patients/${patientId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setChart(data);
      } catch {
        if (!cancelled) setLoadError("Patient chart could not be loaded.");
      }
    }

    loadPatientChart();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const stepDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const setSelectedOrderPatch = (data: Partial<Order>) => {
    setChart((prev) => prev ? { ...prev, selectedOrder: { ...prev.selectedOrder, ...data } } : prev);
  };

  const handleMarkChartViewed = async () => {
    if (!chart?.review) return;
    setActionError("");
    const res = await fetch(`/api/provider/patients/${chart.patient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: chart.selectedOrder.id,
        action: "mark_chart_viewed",
        reviewedBy: "Dr. Provider",
      }),
    });

    if (!res.ok) {
      setActionError("Could not mark chart as reviewed.");
      return;
    }

    const data = await res.json();
    setChart((prev) => prev ? { ...prev, review: data.review ?? prev.review } : prev);
  };

  const handleApprove = async () => {
    if (!chart) return;
    setActionError("");
    setApproving(true);
    setApprovalSteps([
      { label: "Recording provider approval", status: "running" },
      { label: "Sending to pharmacy", status: "pending" },
      { label: "Finalizing chart status", status: "pending" },
    ]);

    await stepDelay(500);
    try {
      if (chart.selectedOrder.status !== "approved") {
        const reviewRes = await fetch("/api/provider/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: chart.selectedOrder.id,
            action: "approve",
            notes: providerNotes,
            reviewedBy: "Dr. Provider",
          }),
        });
        if (!reviewRes.ok) throw new Error((await reviewRes.json()).error ?? "Provider approval failed");
        setSelectedOrderPatch({ status: "approved", approvedAt: new Date().toISOString() });
      }
      setApprovalSteps((prev) => prev.map((step, index) => index === 0 ? { ...step, status: "done" } : index === 1 ? { ...step, status: "running" } : step));

      await stepDelay(500);
      const dispatchRes = await fetch("/api/orders/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: chart.selectedOrder.id,
          patientData: chart.patient,
          productData: chart.product,
        }),
      });
      if (!dispatchRes.ok) throw new Error((await dispatchRes.json()).error ?? "Pharmacy dispatch failed");
      setSelectedOrderPatch({ status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
      setApprovalSteps((prev) => prev.map((step, index) => index === 1 ? { ...step, status: "done" } : index === 2 ? { ...step, status: "running" } : step));

      await stepDelay(300);
      setApprovalSteps((prev) => prev.map((step, index) => index === 2 ? { ...step, status: "done" } : step));
      setApproved(true);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!chart) return;
    setActionError("");
    const reason = providerNotes || "Not eligible at this time.";
    const res = await fetch("/api/provider/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: chart.selectedOrder.id,
        action: "reject",
        notes: reason,
        rejectionReason: reason,
        reviewedBy: "Dr. Provider",
      }),
    });

    if (!res.ok) {
      setActionError((await res.json()).error ?? "Could not reject order.");
      return;
    }

    setSelectedOrderPatch({ status: "rejected", rejectionReason: reason });
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="provider" />
        <div className="container-max py-12 text-center">
          <p className="text-red-600 font-semibold">{loadError}</p>
          <button onClick={() => router.back()} className="mt-4 text-teal-600 hover:text-teal-700 text-sm font-medium">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="provider" />
        <div className="container-max py-12 text-center">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading patient...</p>
        </div>
      </div>
    );
  }

  const { patient, selectedOrder, questionnaire, answers, consent, uploads, payment, pharmacyOrder, review } = chart;
  const chartMarkedViewed = !!review?.chartViewedAt;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="provider" />
      <div className="container-max py-6 sm:py-10">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-teal-600 hover:text-teal-700 mb-6 sm:mb-8 text-sm font-medium">
          <ChevronLeft size={18} />
          Back to Dashboard
        </button>

        {actionError && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {actionError}
          </div>
        )}

        <div className={`mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border ${chartMarkedViewed ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
          <div className="flex items-center gap-3">
            {chartMarkedViewed ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <Eye className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            <div>
              <p className={`text-sm font-semibold ${chartMarkedViewed ? "text-green-800" : "text-amber-800"}`}>
                {chartMarkedViewed ? "Chart reviewed" : "Chart not yet marked as reviewed"}
              </p>
              {chartMarkedViewed && review?.chartViewedAt ? (
                <p className="text-xs text-green-600 mt-0.5">
                  Confirmed by {review.chartViewedBy} on {new Date(review.chartViewedAt).toLocaleString()}
                </p>
              ) : (
                <p className="text-xs text-amber-600 mt-0.5">Mark this chart as reviewed to create an audit record</p>
              )}
            </div>
          </div>
          {!chartMarkedViewed && (
            <Button size="sm" variant="outline" onClick={handleMarkChartViewed} className="flex items-center gap-2 whitespace-nowrap">
              <ClipboardCheck className="w-4 h-4" />
              Mark Chart as Reviewed
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{patient.firstName} {patient.lastName}</h2>
                  <Badge className={getStatusColor(selectedOrder.status)}>{getStatusLabel(selectedOrder.status)}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                  <p>Email: {patient.email}</p>
                  <p>Phone: {patient.phone}</p>
                  <p>DOB: {patient.dateOfBirth}</p>
                  <p>Address: {patient.address.city}, {patient.address.state}</p>
                </div>
              </CardContent>
            </Card>

            {answers.length > 0 && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-500" />
                    Health Questionnaire
                  </h3>
                  <div className="space-y-4">
                    {answers.map((answer) => {
                      const question = questionnaire.find((q) => q.id === answer.questionId);
                      return (
                        <div key={answer.id} className="border-b border-gray-50 pb-4 last:border-0">
                          <p className="font-medium text-gray-800 text-sm mb-1">{question?.text || answer.questionId}</p>
                          <p className="text-gray-600 text-sm">{answer.answer || <span className="text-gray-400 italic">No answer</span>}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {consent && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Consent Record</h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">Signed by</span>
                      <span className="font-semibold text-gray-800">{consent.signedName}</span>
                    </div>
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">Signed at</span>
                      <span className="text-gray-700">{new Date(consent.signedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-5 sm:p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Identity Documents</h3>
                {uploads.length > 0 ? (
                  <div className="space-y-3">
                    {uploads.map((upload) => (
                      <div key={upload.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl flex-wrap gap-3">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{upload.type === "driver_license" ? "Driver's License / ID" : "Identity Video"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{upload.filename}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="success">Uploaded</Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUpload(upload)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View proof
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No identity files uploaded yet.</p>
                )}
              </CardContent>
            </Card>

            {selectedOrder.status === "pending_review" || selectedOrder.status === "approved" ? (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Provider Notes</h3>
                  <Textarea
                    value={providerNotes}
                    onChange={(e) => setProviderNotes(e.target.value)}
                    placeholder="Optional notes for your records or rejection reason..."
                    rows={3}
                  />
                </CardContent>
              </Card>
            ) : null}

            {approvalSteps.length > 0 && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Processing Order...</h3>
                  <div className="space-y-3">
                    {approvalSteps.map((step) => (
                      <div key={step.label} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${step.status === "done" ? "bg-green-100" : step.status === "running" ? "bg-blue-50" : "bg-gray-100"}`}>
                          {step.status === "done" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <div className="w-2 h-2 bg-gray-300 rounded-full" />}
                        </div>
                        <span className={`text-sm ${step.status === "running" ? "text-blue-600 font-medium" : "text-gray-700"}`}>{step.label}</span>
                      </div>
                    ))}
                  </div>
                  {approved && (
                    <div className="mt-5 p-4 bg-green-50 rounded-xl border border-green-100 text-center">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="font-semibold text-green-800">Order approved and sent to pharmacy.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Order Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between flex-wrap gap-1">
                    <span className="text-gray-500">Order ID</span>
                    <span className="font-mono text-xs text-gray-700">{selectedOrder.id.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between flex-wrap gap-1">
                    <span className="text-gray-500">Submitted</span>
                    <span className="text-gray-700 text-xs">{formatDateTime(selectedOrder.createdAt)}</span>
                  </div>
                  <div className="flex justify-between items-center flex-wrap gap-1">
                    <span className="text-gray-500">Status</span>
                    <Badge className={getStatusColor(selectedOrder.status)}>{getStatusLabel(selectedOrder.status)}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-gray-400" />
                  Chart Review Audit
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between flex-wrap gap-1">
                    <span className="text-gray-500">Viewed</span>
                    <span className={`font-semibold text-xs ${chartMarkedViewed ? "text-green-600" : "text-amber-600"}`}>
                      {chartMarkedViewed ? "Yes - confirmed" : "Not yet confirmed"}
                    </span>
                  </div>
                  {review?.chartViewedAt && (
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">At</span>
                      <span className="text-gray-700 text-xs">{new Date(review.chartViewedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {payment && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    Payment
                  </h3>
                  <p className="text-2xl font-bold text-teal-600 mb-1">{formatCurrency(payment.amount)}</p>
                  <p className="text-xs text-gray-400">Card ending {payment.cardLast4}</p>
                  <div className="mt-2">
                    <Badge className={getStatusColor(payment.status)}>{getStatusLabel(payment.status)}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Pharmacy</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center flex-wrap gap-1">
                    <span className="text-gray-500">Status</span>
                    <Badge className={getStatusColor(selectedOrder.pharmacyStatus)}>
                      {getStatusLabel(selectedOrder.pharmacyStatus)}
                    </Badge>
                  </div>
                  {pharmacyOrder?.lifeFileOrderId && (
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">LifeFile ID</span>
                      <span className="font-mono text-xs text-gray-700">{pharmacyOrder.lifeFileOrderId}</span>
                    </div>
                  )}
                  {pharmacyOrder?.lastError && (
                    <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{pharmacyOrder.lastError}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {(selectedOrder.status === "pending_review" || selectedOrder.status === "approved" || (selectedOrder.status === "sent_to_pharmacy" && selectedOrder.pharmacyStatus !== "submitted")) && !approving && !approved && (
              <div className="space-y-3">
                <Button fullWidth onClick={handleApprove}>Approve &amp; Process Order</Button>
                <Button fullWidth variant="outline" onClick={handleReject}>Reject Order</Button>
              </div>
            )}

            {selectedOrder.status === "sent_to_pharmacy" && selectedOrder.pharmacyStatus !== "submitted" && !approved && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-center">
                <p className="text-amber-800 font-semibold text-sm">Pharmacy submission pending</p>
                <p className="text-amber-700 text-xs mt-1">Use Approve & Process Order to retry dispatch</p>
              </div>
            )}

            {selectedOrder.status === "sent_to_pharmacy" && selectedOrder.pharmacyStatus === "submitted" && !approved && (
              <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl text-center">
                <p className="text-teal-700 font-semibold text-sm">Sent to Pharmacy</p>
                <p className="text-teal-600 text-xs mt-1">No manual action required</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="identity-proof-title"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-4 sm:p-5">
              <div>
                <h2 id="identity-proof-title" className="text-lg font-bold text-gray-900">
                  {selectedUpload.type === "driver_license" ? "Driver's License / ID" : "Identity Video"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{selectedUpload.filename}</p>
                <p className="mt-0.5 text-xs text-gray-400">Uploaded {formatDateTime(selectedUpload.uploadedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUpload(null)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close proof preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-auto p-4 sm:p-5">
              {selectedUpload.mimeType.startsWith("video/") ? (
                <video
                  controls
                  playsInline
                  className="max-h-[65vh] w-full rounded-xl bg-black"
                  src={selectedUpload.base64Data}
                />
              ) : selectedUpload.mimeType.startsWith("image/") ? (
                <img
                  src={selectedUpload.base64Data}
                  alt={selectedUpload.type === "driver_license" ? "Uploaded government ID proof" : "Uploaded identity proof"}
                  className="max-h-[65vh] w-full rounded-xl bg-gray-50 object-contain"
                />
              ) : (
                <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                  This proof file cannot be previewed in the browser.
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-100 p-4 sm:p-5">
              <Button type="button" variant="outline" onClick={() => setSelectedUpload(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
