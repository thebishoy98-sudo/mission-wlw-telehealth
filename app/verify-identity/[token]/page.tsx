"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function VerifyIdentityPage() {
  const params = useParams<{ token: string }>();
  const [idImageData, setIdImageData] = useState("");
  const [selfieFrameData, setSelfieFrameData] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  const readImage = (file: File, setter: (value: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => setter(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const readVideoFrame = (file: File) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration || 1);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setSelfieFrameData(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
  };

  const submit = async () => {
    setSubmitting(true);
    setResult(null);
    const response = await fetch("/api/identity/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        idImageData,
        selfieFrameData,
      }),
    });
    const payload = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setResult({ status: "error", message: payload.error ?? "Identity upload failed." });
      return;
    }
    setResult({
      status: "success",
      message:
        payload.identityStatus === "verified"
          ? "Identity verified. Your order can now continue to pharmacy processing."
          : "Upload received. Our team will review it before pharmacy dispatch.",
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Identity Verification</h1>
            <p className="text-sm text-gray-600 mt-2">
              Upload your government ID and a short selfie video so the provider can release your order to pharmacy.
            </p>
          </div>

          <label className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-teal-500">
            <input
              type="file"
              accept="image/*"
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
              <span className="inline-flex items-center gap-2 text-gray-700 font-semibold">
                <Upload className="h-5 w-5" /> Upload ID photo
              </span>
            )}
          </label>

          <label className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-teal-500">
            <input
              type="file"
              accept="video/*"
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
              <span className="inline-flex items-center gap-2 text-gray-700 font-semibold">
                <Upload className="h-5 w-5" /> Upload selfie video
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
