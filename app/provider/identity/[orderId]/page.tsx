"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, ChevronLeft, FileImage, Send, ShieldCheck, Video } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime } from "@/lib/utils";
import type { Order, Patient, ProviderReview, Upload } from "@/types";

interface IdentityReviewState {
  order: Order;
  patient: Patient | null;
  uploads: Upload[];
  review: ProviderReview | null;
}

function IdentityReviewContent() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const [data, setData] = useState<IdentityReviewState | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<"approve" | "deny" | "resend" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/identity/review?orderId=${encodeURIComponent(params.orderId)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not load identity review.");
      const payload = await response.json();
      setData(payload);
      setNotes(payload.order?.identityReason ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [params.orderId]);

  const submitAction = async (action: "approve" | "deny") => {
    setActioning(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/identity/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: params.orderId,
          action,
          reviewedBy: "Dr. Provider",
          notes,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Identity review failed.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActioning("");
    }
  };

  const resendVerificationText = async () => {
    setActioning("resend");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/identity/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: params.orderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not resend verification text.");
      setNotice(`Verification text resent to ${payload.phone}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActioning("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="provider" />
        <div className="container-max py-12 text-center text-gray-600">Loading identity credentials...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="provider" />
        <div className="container-max py-12 text-center text-red-600">{error || "Identity review not found."}</div>
      </div>
    );
  }

  const latestUpload = (type: Upload["type"]) =>
    data.uploads
      .filter((upload) => upload.type === type)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  const idUpload = latestUpload("driver_license");
  const selfieUpload =
    data.uploads
      .filter((upload) => upload.type === "selfie_video" && upload.mimeType.startsWith("video/"))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? latestUpload("selfie_video");
  const hasIdentityVideo = !!selfieUpload?.base64Data && selfieUpload.mimeType.startsWith("video/");
  const aiResult = data.order.identityAiResult ?? data.review?.identityAiResult;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="provider" />
      <div className="container-max py-6 sm:py-10">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-1 text-sm font-medium text-teal-700">
          <ChevronLeft size={18} />
          Back
        </button>

        {error && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
        {notice && (
          <div className="mb-5 rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-700">{notice}</div>
        )}

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Identity Review</h1>
            <p className="mt-1 text-sm text-gray-600">
              {data.patient ? `${data.patient.firstName} ${data.patient.lastName}` : "Unknown patient"} · Order {data.order.id.slice(-8)}
            </p>
          </div>
          <Badge className={data.order.identityStatus === "manual_approved" || data.order.identityStatus === "verified" ? "bg-green-100 text-green-800" : data.order.identityStatus === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
            {data.order.identityStatus ?? "missing"}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                  <ShieldCheck className="h-5 w-5 text-teal-600" />
                  Submitted Credentials
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <FileImage className="h-4 w-4 text-gray-500" />
                      Government ID
                    </div>
                    {idUpload?.base64Data ? (
                      <img src={idUpload.base64Data} alt="Uploaded government ID" className="max-h-72 w-full rounded-md object-contain bg-white" />
                    ) : (
                      <p className="text-sm text-gray-500">No ID image uploaded.</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Video className="h-4 w-4 text-gray-500" />
                      Identity Video
                    </div>
                    {hasIdentityVideo ? (
                      <video controls playsInline src={selfieUpload.base64Data} className="max-h-72 w-full rounded-md bg-white" />
                    ) : selfieUpload?.base64Data ? (
                      <img src={selfieUpload.base64Data} alt="Uploaded identity video frame" className="max-h-72 w-full rounded-md object-contain bg-white" />
                    ) : (
                      <p className="text-sm text-gray-500">No identity video uploaded.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold text-gray-900">Review Notes</h2>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-lg font-bold text-gray-900">Automated Check</h2>
                {aiResult ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Result</span>
                      <span className="font-semibold text-gray-900">{aiResult.status.replace("_", " ")}</span>
                    </div>
                    <p className="rounded-lg bg-gray-50 p-3 text-gray-700">{aiResult.summary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Manual review required.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 text-sm">
                <h2 className="mb-3 text-lg font-bold text-gray-900">Audit</h2>
                <div className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Order created</span>
                    <span className="text-right text-gray-800">{formatDateTime(data.order.createdAt)}</span>
                  </div>
                  {data.order.identityReviewedAt && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Reviewed</span>
                      <span className="text-right text-gray-800">{formatDateTime(data.order.identityReviewedAt)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {data.order.identityStatus !== "verified" && data.order.identityStatus !== "manual_approved" && (
                <Button fullWidth variant="outline" onClick={resendVerificationText} disabled={!!actioning}>
                  {actioning === "resend" ? "Sending..." : (
                    <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" /> Resend Verification Text</span>
                  )}
                </Button>
              )}
              <Button fullWidth onClick={() => submitAction("approve")} disabled={!!actioning}>
                {actioning === "approve" ? "Approving..." : (
                  <span className="inline-flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Approve Identity</span>
                )}
              </Button>
              <Button fullWidth variant="outline" onClick={() => submitAction("deny")} disabled={!!actioning}>
                {actioning === "deny" ? "Denying..." : (
                  <span className="inline-flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Deny Identity</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IdentityReviewPage() {
  return (
    <ProtectedRoute requiredRole="provider">
      <IdentityReviewContent />
    </ProtectedRoute>
  );
}
