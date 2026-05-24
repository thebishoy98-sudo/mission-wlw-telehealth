"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AlertCircle, Camera, CheckCircle, ShieldCheck, Video } from "lucide-react";

const RECORDING_SECONDS = 10;

export default function VerifyIdentityPage() {
  const params = useParams<{ token: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [idImageData, setIdImageData] = useState("");
  const [identityVideoFrameData, setIdentityVideoFrameData] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const captureVideoFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setIdentityVideoFrameData(canvas.toDataURL("image/jpeg", 0.85));
  };

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
      setResult({ status: "error", message: "Could not read the identity video. Try a shorter video in good lighting." });
    };
    const finish = () => {
      if (completed) return;
      completed = true;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setIdentityVideoFrameData(canvas.toDataURL("image/jpeg", 0.85));
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

  const startRecording = async () => {
    setResult(null);
    setIdentityVideoFrameData("");
    setRecordingSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setRecording(true);
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setRecordingSeconds(seconds);
        if (seconds >= RECORDING_SECONDS) {
          captureVideoFrame();
          stopCamera();
        }
      }, 1000);
    } catch {
      setResult({ status: "error", message: "Camera access was blocked. You can upload a 10-second identity video instead." });
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
          selfieFrameData: identityVideoFrameData,
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

  const progress = Math.min(100, (recordingSeconds / RECORDING_SECONDS) * 100);

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
              <p className="text-sm text-teal-900">
                Take a clear ID photo, then record a 10-second identity video in good lighting.
              </p>
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

          <div className="rounded-lg border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">10-Second Identity Video</h2>
              <p className="text-xs text-gray-500 mt-1">
                Face a light source, remove sunglasses, hold still, then slowly turn your head left and right.
              </p>
            </div>
            <video ref={videoRef} playsInline muted className={`w-full rounded-lg bg-gray-100 ${recording ? "block" : "hidden"}`} />
            {recording && (
              <div>
                <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                  <span>Recording: {recordingSeconds} seconds</span>
                  <span>{RECORDING_SECONDS}s</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {identityVideoFrameData && !recording ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">
                <CheckCircle className="h-5 w-5" />
                Video recorded
              </div>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="button" onClick={recording ? stopCamera : startRecording} variant={recording ? "outline" : "primary"}>
                <Video className="h-4 w-4 mr-2" />
                {recording ? "Stop Recording" : "Start Recording"}
              </Button>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">
                <input
                  type="file"
                  accept="video/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.[0]) readVideoFrame(event.target.files[0]);
                  }}
                />
                Upload Video
              </label>
            </div>
          </div>

          {result && (
            <div className={`rounded-lg border p-4 text-sm ${result.status === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              <span className="inline-flex items-center gap-2">
                {result.status === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {result.message}
              </span>
            </div>
          )}

          <Button fullWidth onClick={submit} disabled={submitting || !idImageData || !identityVideoFrameData}>
            {submitting ? "Submitting..." : "Submit Verification"}
          </Button>
        </div>
      </div>
    </main>
  );
}
