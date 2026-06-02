"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IdentityCapture, MAX_VIDEO_DATA_URL_BYTES, type IdentityCaptureValue } from "@/components/identity/IdentityCapture";
import { Button } from "@/components/ui/Button";
import { AlertCircle, CheckCircle } from "lucide-react";

const errorMessage = (value: unknown, fallback: string) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return fallback;
};

const parseJson = (value: string) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

export default function VerifyIdentityPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [linkStatus, setLinkStatus] = useState<"checking" | "ready" | "received" | "invalid">("checking");
  const [identity, setIdentity] = useState<IdentityCaptureValue>({
    idImageData: "",
    identityVideoFrameData: "",
    identityVideoData: "",
    complete: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const validate = async () => {
      setLinkStatus("checking");
      setError("");
      try {
        const response = await fetch(`/api/identity/upload?token=${encodeURIComponent(params.token)}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setLinkStatus("invalid");
          setError(errorMessage(payload.error, "Verification link not found."));
          return;
        }
        setLinkStatus(payload.uploadNeeded === false ? "received" : "ready");
      } catch {
        if (!active) return;
        setLinkStatus("invalid");
        setError("Verification link could not be checked. Please refresh and try again.");
      }
    };

    validate();
    return () => {
      active = false;
    };
  }, [params.token]);

  const handleIdentityChange = useCallback((value: IdentityCaptureValue) => {
    setIdentity(value);
    setError("");
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      if (identity.identityVideoData.length > MAX_VIDEO_DATA_URL_BYTES) {
        setError("The video is too large. Please re-record and try again.");
        return;
      }
      const response = await fetch("/api/identity/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          token: params.token,
          idImageData: identity.idImageData,
          selfieFrameData: identity.identityVideoFrameData,
          identityVideoData: identity.identityVideoData,
        }),
      });
      const responseText = await response.text();
      const payload = parseJson(responseText);
      if (!response.ok) {
        setError(
          response.status === 413
            ? "The video is too large. Please re-record and try again."
            : errorMessage(payload.error, "Identity upload failed.")
        );
        return;
      }
      router.push(`/verify-identity/${encodeURIComponent(params.token)}/submitted`);
    } catch (err) {
      setError(
        (err as Error).name === "AbortError"
          ? "Upload is taking too long. Please check your connection and try again."
          : "Identity upload failed. Please re-record the video and try again."
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  const renderLinkState = () => {
    if (linkStatus === "ready") return null;

    if (linkStatus === "checking") {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Checking verification link...
        </div>
      );
    }

    if (linkStatus === "received") {
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <span className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle className="h-4 w-4" />
            Identity verification is already received.
          </span>
          <p className="mt-2 text-green-700">Our team will review it before pharmacy dispatch.</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <span className="inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error || "Verification link not found. Please request a new text or contact support."}
        </span>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Identity Verification</h1>
            <p className="text-sm text-gray-600 mt-2">
              Complete identity verification before the provider can release your order to pharmacy.
            </p>
          </div>

          {renderLinkState()}

          {linkStatus === "ready" && <IdentityCapture onChange={handleIdentityChange} />}

          {error && linkStatus === "ready" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            </div>
          )}

          {linkStatus === "ready" && (
            <Button fullWidth onClick={submit} disabled={submitting || !identity.complete}>
              {submitting ? "Submitting..." : "Submit Verification"}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
