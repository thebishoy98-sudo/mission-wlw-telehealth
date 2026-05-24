"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CheckCircle, AlertCircle, Camera, ShieldCheck, Video } from "lucide-react";

export default function VerifyIdentityPage() {
  const params = useParams<{ token: string }>();
  const [idImageData, setIdImageData] = useState("");
  const [selfieFrameData, setSelfieFrameData] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingStripe, setStartingStripe] = useState(false);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  const readImage = (file: File, setter: (value: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const value = event.target?.result;
      if (typeof value === "string") setter(value);
    };
    reader.onerror = () => setResult({ status: "error", message: "Could not read that image. Try taking a new photo." });
    reader.readAsDataURL(file);
  };

  const readVideoFrame = (file: File) => {
    setResult(null);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let completed = false;
    const fail = () => {
      if (completed) return;
      completed = true;
      URL.revokeObjectURL(url);
      setResult({ status: "error", message: "Could not read the selfie video. Try a shorter video in good lighting." });
    };
    const finish = () => {
      if (completed) return;
      completed = true;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setSelfieFrameData(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
    const timeout = window.setTimeout(fail, 8000);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration || 1);
    };
    video.onseeked = () => {
      window.clearTimeout(timeout);
      finish();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      fail();
    };
  };

  const startStripeIdentity = async () => {
    setStartingStripe(true);
    setResult(null);
    try {
      const response = await fetch("/api/identity/stripe/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.session?.url) {
        throw new Error(payload.error ?? "Guided verification is not available right now.");
      }
      window.location.href = payload.session.url;
    } catch (error) {
      setResult({
        status: "error",
        message: `${(error as Error).message} Use the secure upload below instead.`,
      });
      setStartingStripe(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setResult(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/identity/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          token: params.token,
          idImageData,
          selfieFrameData,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ status: "error", message: payload.error ?? "Identity upload failed." });
        return;
      }
      setResult({
        status: "success",
        message:
          payload.identityStatus === "verified"
            ? "Identity verified. A provider will complete the chart review before pharmacy processing."
            : "Upload received. Our team will review it before pharmacy dispatch.",
      });
    } catch (error) {
      setResult({
        status: "error",
        message:
          (error as Error).name === "AbortError"
            ? "Upload is taking too long. Please check your connection and try again."
            : "Identity upload failed. Please try again.",
      });
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
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

          <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-700" />
              <div>
                <p className="font-semibold text-teal-950">Guided verification</p>
                <p className="mt-1 text-sm text-teal-800">
                  Use the guided flow when available. It walks you through ID capture and selfie matching on your phone.
                </p>
                <Button className="mt-3" onClick={startStripeIdentity} disabled={startingStripe}>
                  {startingStripe ? "Starting..." : "Start Guided Verification"}
                </Button>
              </div>
            </div>
          </div>

          <label className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-teal-500">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.[0]) readImage(event.target.files[0], setIdImageData);
              }}
            />
            {idImageData ? (
              <span className="inline-flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="h-5 w-5" /> ID photo ready
              </span>
            ) : (
              <span className="inline-flex flex-col items-center gap-2 text-gray-700">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <Camera className="h-5 w-5" /> Take ID photo
                </span>
                <span className="max-w-sm text-xs text-gray-500">
                  Place the ID on a flat dark surface. Capture the full front of the card with no glare or cut-off corners.
                </span>
              </span>
            )}
          </label>

          <label className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-teal-500">
            <input
              type="file"
              accept="video/*"
              capture="user"
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.[0]) readVideoFrame(event.target.files[0]);
              }}
            />
            {selfieFrameData ? (
              <span className="inline-flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="h-5 w-5" /> Selfie video ready
              </span>
            ) : (
              <span className="inline-flex flex-col items-center gap-2 text-gray-700">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <Video className="h-5 w-5" /> Record selfie video
                </span>
                <span className="max-w-sm text-xs text-gray-500">
                  Face a light source, remove sunglasses, hold still, then slowly turn your head left and right.
                </span>
              </span>
            )}
          </label>

          {result && (
            <div className={`rounded-lg border p-4 text-sm ${result.status === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              <span className="inline-flex items-center gap-2">
                {result.status === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {result.message}
              </span>
            </div>
          )}

          <Button fullWidth onClick={submit} disabled={submitting || !idImageData || !selfieFrameData}>
            {submitting ? "Submitting..." : "Submit Verification"}
          </Button>
        </div>
      </div>
    </main>
  );
}
