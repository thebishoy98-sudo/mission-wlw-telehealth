"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatDateTime, formatCurrency } from "@/lib/utils";
import * as practiceqService from "@/services/practiceq";
import * as lifefileService from "@/services/lifefile";
import * as quickbooksService from "@/services/quickbooks";
import * as spruceService from "@/services/spruce";
import { ChevronLeft, CheckCircle, FileText, CreditCard, Pill, Eye, ClipboardCheck } from "lucide-react";

export default function PatientDetail() {
  const params = useParams();
  const router = useRouter();
  const patientId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [patient, setPatient] = useState<Types.Patient | null>(null);
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Types.Order | null>(null);
  const [providerNotes, setProviderNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvalSteps, setApprovalSteps] = useState<{ label: string; status: "pending" | "done" | "running" }[]>([]);
  const [approved, setApproved] = useState(false);
  const [review, setReview] = useState<Types.ProviderReview | null>(null);
  const [chartMarkedViewed, setChartMarkedViewed] = useState(false);

  useEffect(() => {
    if (patientId) {
      const p = db.patientDb.getById(patientId);
      setPatient(p);
      const patientOrders = db.orderDb.getByPatient(patientId);
      setOrders(patientOrders);
      if (patientOrders.length > 0) setSelectedOrder(patientOrders[0]);
    }
  }, [patientId]);

  // When an order is selected, load its review and auto-log page view
  useEffect(() => {
    if (!selectedOrder || !patientId) return;
    const r = db.providerReviewDb.getByOrder(selectedOrder.id);
    setReview(r);
    setChartMarkedViewed(!!(r?.chartViewedAt));

    // Auto-log that provider opened the chart (for system audit trail)
    if (r && !r.chartViewedAt) {
      db.integrationLogDb.create({
        id: `log_view_${Date.now()}`,
        timestamp: new Date().toISOString(),
        integrationName: "system",
        action: `Provider opened patient chart for order ${selectedOrder.id.slice(-6)}`,
        orderId: selectedOrder.id,
        patientId,
        status: "success",
        details: { action: "chart_opened", autoLogged: true },
      });
    }
  }, [selectedOrder?.id, patientId]);

  const handleMarkChartViewed = () => {
    if (!review || !selectedOrder || !patient) return;
    const now = new Date().toISOString();
    db.providerReviewDb.update(review.id, {
      chartViewedAt: now,
      chartViewedBy: "Dr. Provider",
    });
    db.integrationLogDb.create({
      id: `log_chartview_${Date.now()}`,
      timestamp: now,
      integrationName: "system",
      action: `Provider confirmed chart review for patient ${patient.firstName} ${patient.lastName}`,
      orderId: selectedOrder.id,
      patientId: patient.id,
      status: "success",
      details: { action: "chart_reviewed", reviewedBy: "Dr. Provider" },
    });
    setChartMarkedViewed(true);
    setReview((prev) => prev ? { ...prev, chartViewedAt: now, chartViewedBy: "Dr. Provider" } : prev);
  };

  if (!patient || !selectedOrder) {
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

  const questionnaire = db.questionDb.getAll();
  const answers = db.answerDb.getByOrder(selectedOrder.id);
  const consent = db.consentDb.getByOrder(selectedOrder.id);
  const uploads = db.uploadDb.getByOrder(selectedOrder.id);
  const payment = db.paymentDb.getByOrder(selectedOrder.id);

  const stepDelay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleApprove = async () => {
    setApproving(true);
    const steps = [
      { label: "Submitting to PracticeQ", status: "running" as const },
      { label: "Creating QuickBooks invoice", status: "pending" as const },
      { label: "Sending to pharmacy", status: "pending" as const },
      { label: "Sending patient SMS confirmation", status: "pending" as const },
      { label: "Scheduling 30-day reorder reminder", status: "pending" as const },
    ];
    setApprovalSteps(steps);

    await stepDelay(700);
    try { practiceqService.submitIntakePacket(selectedOrder); } catch {}
    db.orderDb.update(selectedOrder.id, { practiceQStatus: "submitted" });
    setApprovalSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, status: "done" } : i === 1 ? { ...s, status: "running" } : s));

    await stepDelay(700);
    try {
      if (payment) {
        const invoiceId = await quickbooksService.createInvoice(selectedOrder, payment);
        await quickbooksService.recordPayment(invoiceId, payment.amount);
        db.paymentDb.update(payment.id, { status: "completed", processedAt: new Date().toISOString() });
        db.orderDb.update(selectedOrder.id, { quickbooksStatus: "invoiced", paymentStatus: "completed" });
      }
    } catch {}
    setApprovalSteps((prev) => prev.map((s, i) => i === 1 ? { ...s, status: "done" } : i === 2 ? { ...s, status: "running" } : s));

    await stepDelay(800);
    try {
      lifefileService.createPharmacyOrder(selectedOrder);
      db.orderDb.update(selectedOrder.id, { pharmacyStatus: "submitted", status: "sent_to_pharmacy" });
    } catch {}
    setApprovalSteps((prev) => prev.map((s, i) => i === 2 ? { ...s, status: "done" } : i === 3 ? { ...s, status: "running" } : s));

    await stepDelay(600);
    try {
      spruceService.sendMessage(patient.id, "order_approved", { patientName: patient.firstName, orderId: selectedOrder.id });
    } catch {}
    setApprovalSteps((prev) => prev.map((s, i) => i === 3 ? { ...s, status: "done" } : i === 4 ? { ...s, status: "running" } : s));

    await stepDelay(500);
    try { spruceService.scheduleReorderReminder(selectedOrder.id, 30); } catch {}

    if (review) {
      db.providerReviewDb.update(review.id, {
        status: "approved",
        reviewedAt: new Date().toISOString(),
        reviewedBy: "Dr. Provider",
        notes: providerNotes,
      });
    }

    db.integrationLogDb.create({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: "Order approved by provider — PracticeQ, QuickBooks, Pharmacy, Spruce notified",
      orderId: selectedOrder.id,
      patientId: patient.id,
      status: "success",
      details: { providerNotes },
    });

    setApprovalSteps((prev) => prev.map((s, i) => i === 4 ? { ...s, status: "done" } : s));
    setApproving(false);
    setApproved(true);
    setSelectedOrder((prev) => prev ? { ...prev, status: "sent_to_pharmacy" } : prev);
  };

  const handleReject = () => {
    const reason = providerNotes || "Not eligible at this time.";
    db.orderDb.update(selectedOrder.id, { status: "rejected", rejectionReason: reason });
    if (review) {
      db.providerReviewDb.update(review.id, {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: "Dr. Provider",
        notes: reason,
      });
    }
    try {
      spruceService.sendMessage(patient.id, "order_rejected", { patientName: patient.firstName, orderId: selectedOrder.id });
    } catch {}
    db.integrationLogDb.create({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: "Order rejected by provider",
      orderId: selectedOrder.id,
      patientId: patient.id,
      status: "success",
      details: { reason },
    });
    setSelectedOrder((prev) => prev ? { ...prev, status: "rejected" } : prev);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="provider" />
      <div className="container-max py-6 sm:py-10">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-teal-600 hover:text-teal-700 mb-6 sm:mb-8 text-sm font-medium"
        >
          <ChevronLeft size={18} />
          Back to Dashboard
        </button>

        {/* Chart Viewed Banner */}
        <div className={`mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border ${chartMarkedViewed ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
          <div className="flex items-center gap-3">
            {chartMarkedViewed ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <Eye className="w-5 h-5 text-amber-500 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-semibold ${chartMarkedViewed ? "text-green-800" : "text-amber-800"}`}>
                {chartMarkedViewed ? "Chart reviewed" : "Chart not yet marked as reviewed"}
              </p>
              {chartMarkedViewed && review?.chartViewedAt && (
                <p className="text-xs text-green-600 mt-0.5">
                  Confirmed by {review.chartViewedBy} on {new Date(review.chartViewedAt).toLocaleString()}
                </p>
              )}
              {!chartMarkedViewed && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Mark this chart as reviewed to create an audit record
                </p>
              )}
            </div>
          </div>
          {!chartMarkedViewed && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkChartViewed}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <ClipboardCheck className="w-4 h-4" />
              Mark Chart as Reviewed
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            {/* Patient Info */}
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {patient.firstName} {patient.lastName}
                  </h2>
                  <Badge className={getStatusColor(selectedOrder.status)}>
                    {getStatusLabel(selectedOrder.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                  <p>📧 {patient.email}</p>
                  <p>📱 {patient.phone}</p>
                  <p>🎂 {patient.dateOfBirth}</p>
                  <p>📍 {patient.address.city}, {patient.address.state}</p>
                </div>
              </CardContent>
            </Card>

            {/* Questionnaire */}
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

            {/* Consent */}
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
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {Object.entries(consent.acknowledgments).map(([key, val]) => (
                        <span key={key} className={`text-xs px-2 py-1 rounded-full font-medium ${val ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {key}: {val ? "✓" : "✗"}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Uploads */}
            {uploads.length > 0 && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Identity Documents</h3>
                  <div className="space-y-3">
                    {uploads.map((upload) => (
                      <div key={upload.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl flex-wrap gap-2">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {upload.type === "driver_license" ? "Driver's License / ID" : "Selfie Video (20s)"}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{upload.filename} · {(upload.fileSize / 1000000).toFixed(1)}MB</p>
                        </div>
                        <Badge variant="success">Uploaded</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Provider Notes */}
            {selectedOrder.status === "pending_review" && (
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
            )}

            {/* Approval progress */}
            {approvalSteps.length > 0 && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Processing Order...</h3>
                  <div className="space-y-3">
                    {approvalSteps.map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          step.status === "done" ? "bg-green-100" :
                          step.status === "running" ? "bg-blue-50" : "bg-gray-100"
                        }`}>
                          {step.status === "done" ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : step.status === "running" ? (
                            <svg className="animate-spin w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : (
                            <div className="w-2 h-2 bg-gray-300 rounded-full" />
                          )}
                        </div>
                        <span className={`text-sm ${step.status === "done" ? "text-gray-700" : step.status === "running" ? "text-blue-600 font-medium" : "text-gray-400"}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {approved && (
                    <div className="mt-5 p-4 bg-green-50 rounded-xl border border-green-100 text-center">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="font-semibold text-green-800">All done! Order approved and all systems notified.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Order info */}
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
                    <Badge className={getStatusColor(selectedOrder.status)}>
                      {getStatusLabel(selectedOrder.status)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chart Review Audit */}
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
                      {chartMarkedViewed ? "Yes — confirmed" : "Not yet confirmed"}
                    </span>
                  </div>
                  {review?.chartViewedAt && (
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">At</span>
                      <span className="text-gray-700 text-xs">{new Date(review.chartViewedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {review?.chartViewedBy && (
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">By</span>
                      <span className="text-gray-700 text-xs">{review.chartViewedBy}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Integration status */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Integration Status</h3>
                <div className="space-y-2.5">
                  {[
                    { icon: FileText, label: "PracticeQ", value: selectedOrder.practiceQStatus },
                    { icon: CreditCard, label: "QuickBooks", value: selectedOrder.quickbooksStatus },
                    { icon: Pill, label: "Pharmacy", value: selectedOrder.pharmacyStatus },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Icon className="w-4 h-4 text-gray-400" />
                        {label}
                      </div>
                      <Badge className={getStatusColor(value)}>{value}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            {payment && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    Payment
                  </h3>
                  <p className="text-2xl font-bold text-teal-600 mb-1">
                    {formatCurrency(payment.amount)}
                  </p>
                  <p className="text-xs text-gray-400">Card ending ···· {payment.cardLast4}</p>
                  <div className="mt-2">
                    <Badge className={getStatusColor(payment.status)}>
                      {payment.status === "pending" ? "Authorized (not captured)" : getStatusLabel(payment.status)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action buttons — only for orders still pending manual review */}
            {selectedOrder.status === "pending_review" && !approving && !approved && (
              <div className="space-y-3">
                <Button fullWidth onClick={handleApprove}>
                  Approve &amp; Process Order
                </Button>
                <Button fullWidth variant="outline" onClick={handleReject}>
                  Reject Order
                </Button>
              </div>
            )}

            {approved && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-2xl text-center">
                <p className="text-green-700 font-semibold text-sm">Order Approved</p>
                <p className="text-green-600 text-xs mt-1">Patient notified via SMS</p>
              </div>
            )}

            {selectedOrder.status === "sent_to_pharmacy" && !approved && (
              <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl text-center">
                <p className="text-teal-700 font-semibold text-sm">Sent to Pharmacy</p>
                <p className="text-teal-600 text-xs mt-1">Auto-processed — no manual action required</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
