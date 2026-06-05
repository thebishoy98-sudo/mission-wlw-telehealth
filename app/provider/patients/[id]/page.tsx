"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, CheckCircle, Eye, FileText, X } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { buildConsentCertificate } from "@/lib/consent";
import { getDisplayOrderNumber } from "@/lib/order-display";
import { formatDateTime, getStatusColor, getStatusLabel } from "@/lib/utils";
import type {
  ConsentRecord,
  Order,
  Patient,
  PharmacyOrder,
  PracticeQMirror,
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
  review: ProviderReview | null;
  pharmacyOrder: PharmacyOrder | null;
  practiceq: PracticeQMirror | null;
}

export default function PatientDetail() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = Array.isArray(params.id) ? params.id[0] : params.id;
  const orderId = searchParams.get("orderId") ?? "";

  const [chart, setChart] = useState<ChartState | null>(null);
  const [chartReviewing, setChartReviewing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);

  useEffect(() => {
    if (!patientId) return;

    let cancelled = false;
    async function loadPatientChart() {
      setLoadError("");
      try {
        const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
        const res = await fetch(`/api/provider/patients/${patientId}${query}`, { cache: "no-store" });
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
  }, [patientId, orderId]);

  const handleMarkChartReviewed = async () => {
    if (!chart || !patientId) return;
    setActionError("");
    setChartReviewing(true);

    try {
      const res = await fetch(`/api/provider/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: chart.selectedOrder.id,
          action: "mark_chart_viewed",
          reviewedBy: "Dotson, Karen",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not mark chart reviewed.");

      if (data.review) {
        setChart((prev) => prev ? { ...prev, review: data.review } : prev);
      }
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setChartReviewing(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="provider" />
        <div className="container-max py-12 text-center">
          <p className="text-red-600 font-semibold">{loadError}</p>
          <button onClick={() => router.back()} className="mt-4 text-forest-800 hover:text-forest-800 text-sm font-medium">
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
          <div className="w-8 h-8 border-2 border-green-300 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading patient...</p>
        </div>
      </div>
    );
  }

  const { patient, selectedOrder, questionnaire, answers, consent, uploads, review, pharmacyOrder } = chart;
  const selectedPracticeQ = chart.practiceq;
  const consentCertificate = consent ? buildConsentCertificate(consent, patient) : "";
  const chartFileHref = (fileId: string) => ["/api/provider/", "practice", "q-files/", fileId].join("");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="provider" />
      <div className="container-max py-6 sm:py-10">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-forest-800 hover:text-forest-800 mb-6 sm:mb-8 text-sm font-medium">
          <ChevronLeft size={18} />
          Back to Dashboard
        </button>

        {actionError && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {actionError}
          </div>
        )}

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
                    <FileText className="w-5 h-5 text-forest-700" />
                    Health Questionnaire
                  </h3>
                  <div className="space-y-4">
                    {answers.map((answer) => {
                      const question = questionnaire.find((q) => q.id === answer.questionId);
                      const isSoftFlag = question?.warnIf && answer.answer === question.warnIf;
                      return (
                        <div key={answer.id} className={`border-b border-gray-50 pb-4 last:border-0 ${isSoftFlag ? "rounded-lg border border-amber-200 bg-amber-50 p-3" : ""}`}>
                          <p className="font-medium text-gray-800 text-sm mb-1 flex items-center gap-2">
                            {question?.text || answer.questionId}
                            {isSoftFlag && <span className="text-amber-700 text-xs font-bold bg-amber-100 px-2 py-0.5 rounded-full">Provider Review Required</span>}
                          </p>
                          <p className={`text-sm ${isSoftFlag ? "text-amber-900 font-semibold" : "text-gray-600"}`}>{answer.answer || <span className="text-gray-400 italic">No answer</span>}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedPracticeQ?.available && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-forest-700" />
                      Clinical Chart
                    </h3>
                    {selectedPracticeQ.status && <Badge variant="success">{selectedPracticeQ.status}</Badge>}
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2">
                    {selectedPracticeQ.clientId && <p>Client ID: {selectedPracticeQ.clientId}</p>}
                    {selectedPracticeQ.intakeId && <p>Intake ID: {selectedPracticeQ.intakeId}</p>}
                    {selectedPracticeQ.questionnaireName && <p>Form: {selectedPracticeQ.questionnaireName}</p>}
                    {selectedPracticeQ.submittedAt && <p>Submitted: {formatDateTime(selectedPracticeQ.submittedAt)}</p>}
                  </div>
                  {(selectedPracticeQ.answerFileId || selectedPracticeQ.pdfFileId) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedPracticeQ.answerFileId && (
                        <a
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-green-50"
                          href={chartFileHref(selectedPracticeQ.answerFileId)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Answers JSON
                        </a>
                      )}
                      {selectedPracticeQ.pdfFileId && (
                        <a
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-green-50"
                          href={chartFileHref(selectedPracticeQ.pdfFileId)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Chart PDF
                        </a>
                      )}
                    </div>
                  )}
                  {selectedPracticeQ.answers.length > 0 ? (
                    <div className="mt-5 max-h-96 space-y-4 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
                      {selectedPracticeQ.answers.map((answer, index) => (
                        <div key={`${answer.question}-${index}`} className="border-b border-white pb-3 last:border-0 last:pb-0">
                          <p className="text-sm font-semibold text-gray-800">{answer.question}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{answer.answer || "No answer"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">No chart answers were returned for this intake.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {consent && (
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Consent Record</h3>
                  <div className="mb-4 rounded-lg border border-green-50 bg-green-50 p-3 text-sm text-forest-900">
                    <p className="font-semibold text-forest-900">Consent Certificate</p>
                    <p className="mt-1">{consentCertificate}</p>
                  </div>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">Signed by</span>
                      <span className="font-semibold text-gray-800">{consent.signedName}</span>
                    </div>
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">Signed at</span>
                      <span className="text-gray-700">{new Date(consent.signedAt).toLocaleString()}</span>
                    </div>
                    {consent.ipAddress && (
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="text-gray-500">IP address</span>
                        <span className="text-gray-700">{consent.ipAddress}</span>
                      </div>
                    )}
                    {consent.consentVersion && (
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="text-gray-500">Consent version</span>
                        <span className="text-gray-700">{consent.consentVersion}</span>
                      </div>
                    )}
                    {consent.userAgent && (
                      <div>
                        <span className="text-gray-500">Browser</span>
                        <p className="mt-1 break-words text-gray-700">{consent.userAgent}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Terms accepted</span>
                      <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                        {consent.consentText}
                      </p>
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

          </div>

          <div className="space-y-5">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-gray-400" />
                  Chart Review Audit
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="text-gray-500">Viewed</span>
                    {review?.chartViewedAt ? (
                      <Badge variant="success">Confirmed</Badge>
                    ) : (
                      <span className="font-medium text-amber-600">Not yet confirmed</span>
                    )}
                  </div>
                  {review?.chartViewedAt ? (
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>{formatDateTime(review.chartViewedAt)}</p>
                      {review.chartViewedBy && <p>By {review.chartViewedBy}</p>}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      fullWidth
                      variant="outline"
                      onClick={handleMarkChartReviewed}
                      disabled={chartReviewing}
                    >
                      {chartReviewing ? "Marking..." : "Mark Chart as Reviewed"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Order Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between flex-wrap gap-1">
                    <span className="text-gray-500">LifeFile order number</span>
                    <span className="font-mono text-xs text-gray-700">{getDisplayOrderNumber(selectedOrder, pharmacyOrder)}</span>
                  </div>
                  {pharmacyOrder?.lifeFileOrderId && (
                    <div className="flex justify-between flex-wrap gap-1">
                      <span className="text-gray-500">Order ID</span>
                      <span className="font-mono text-xs text-gray-700">{selectedOrder.id.slice(-8)}</span>
                    </div>
                  )}
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
                  src={selectedUpload.base64Data || `/api/provider/uploads/${selectedUpload.id}`}
                />
              ) : selectedUpload.mimeType.startsWith("image/") ? (
                <div className="relative h-[65vh] w-full overflow-hidden rounded-xl bg-gray-50">
                  <Image
                    src={selectedUpload.base64Data || `/api/provider/uploads/${selectedUpload.id}`}
                    alt={selectedUpload.type === "driver_license" ? "Uploaded government ID proof" : "Uploaded identity proof"}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
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
