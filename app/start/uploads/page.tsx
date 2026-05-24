"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { saveIntakeState } from "@/lib/intake-store";
import { Upload, CheckCircle, Video, AlertTriangle, XCircle, Loader2 } from "lucide-react";

type VerifyResult = {
  verdict: "verified" | "needs_review" | "rejected";
  confidence: number;
  summary: string;
  flags: string[];
};

function extractVideoFrame(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    video.muted = true;
    video.src = url;
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(1, video.duration * 0.1);
    });
    video.addEventListener("seeked", () => {
      const w = Math.min(video.videoWidth || 640, 640);
      const h = Math.round(w * ((video.videoHeight || 480) / (video.videoWidth || 640)));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    });
    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video load error"));
    });
    video.load();
  });
}

export default function Uploads() {
  const router = useRouter();

  // ID photo state
  const [licensePreview, setLicensePreview] = useState<string>("");
  const [idPhotoBase64, setIdPhotoBase64] = useState<string>("");
  const [licenseUploaded, setLicenseUploaded] = useState(false);

  // Selfie state
  const [selfieFrameBase64, setSelfieFrameBase64] = useState<string>("");
  const [selfiePreview, setSelfiePreview] = useState<string>("");
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Webcam refs
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-trigger verification once both images are ready
  useEffect(() => {
    if (idPhotoBase64 && selfieFrameBase64 && !verifying && !verifyResult) {
      runVerification(idPhotoBase64, selfieFrameBase64);
    }
  }, [idPhotoBase64, selfieFrameBase64]);

  const runVerification = async (idB64: string, selfieB64: string) => {
    setVerifying(true);
    try {
      const res = await fetch("/api/ai/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPhotoBase64: idB64, selfieBase64: selfieB64 }),
      });
      const result: VerifyResult = await res.json();
      setVerifyResult(result);
      saveIntakeState({
        licenseUploaded: true,
        selfieUploaded: true,
        identityStatus: result.verdict,
        identityAiResult: result,
      });
    } catch {
      const fallback: VerifyResult = {
        verdict: "needs_review",
        confidence: 0,
        summary: "Verification service unavailable — manual review will be required.",
        flags: [],
      };
      setVerifyResult(fallback);
      saveIntakeState({
        licenseUploaded: true,
        selfieUploaded: true,
        identityStatus: "needs_review",
        identityAiResult: fallback,
      });
    } finally {
      setVerifying(false);
    }
  };

  // ── ID Photo ──────────────────────────────────────────────────────────────

  const handleLicenseUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target?.result as string;
      setLicensePreview(b64);
      setIdPhotoBase64(b64);
      setLicenseUploaded(true);
      // Reset verification if re-uploading
      setVerifyResult(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Webcam Recording ──────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
        const blob = new Blob(chunks, { type: "video/webm" });
        try {
          const frame = await extractVideoFrame(blob);
          setSelfieFrameBase64(frame);
          setSelfiePreview(frame);
          setSelfieUploaded(true);
          setVerifyResult(null);
        } catch {
          alert("Could not extract frame from recording. Please try uploading a video file.");
        }
        setRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setRecordingSeconds(0);

      let secs = 0;
      timerRef.current = setInterval(() => {
        secs++;
        setRecordingSeconds(secs);
        if (secs >= 10) stopRecording();
      }, 1000);
    } catch {
      alert("Camera access denied. Please allow camera access or upload a video file instead.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRecorderRef.current?.stop();
  };

  // ── Video File Upload ─────────────────────────────────────────────────────

  const handleVideoUpload = async (file: File) => {
    try {
      const frame = await extractVideoFrame(file);
      setSelfieFrameBase64(frame);
      setSelfiePreview(frame);
      setSelfieUploaded(true);
      setVerifyResult(null);
    } catch {
      alert("Could not read this video file. Try a different file or record with your camera.");
    }
  };

  const resetSelfie = () => {
    setSelfieUploaded(false);
    setSelfieFrameBase64("");
    setSelfiePreview("");
    setVerifyResult(null);
  };

  // ── Continue ──────────────────────────────────────────────────────────────

  const handleContinue = () => {
    if (!verifyResult) {
      saveIntakeState({
        licenseUploaded,
        selfieUploaded,
        identityStatus: licenseUploaded || selfieUploaded ? "pending" : "missing",
      });
    }
    router.push("/start/payment");
  };

  // ── Verification Result Card ──────────────────────────────────────────────

  const VerificationBadge = () => {
    if (verifying) {
      return (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
          <div>
            <p className="font-semibold text-blue-700 text-sm">Verifying identity with AI...</p>
            <p className="text-xs text-blue-500">Comparing your ID photo and video</p>
          </div>
        </div>
      );
    }
    if (!verifyResult) return null;

    const config = {
      verified: {
        bg: "bg-green-50 border-green-200",
        icon: <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />,
        title: "Identity Verified",
        titleColor: "text-green-700",
        textColor: "text-green-600",
      },
      needs_review: {
        bg: "bg-yellow-50 border-yellow-200",
        icon: <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />,
        title: "Manual Review Required",
        titleColor: "text-yellow-700",
        textColor: "text-yellow-600",
      },
      rejected: {
        bg: "bg-red-50 border-red-200",
        icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
        title: "Verification Failed",
        titleColor: "text-red-700",
        textColor: "text-red-600",
      },
    }[verifyResult.verdict];

    return (
      <div className={`mt-6 p-4 border rounded-xl ${config.bg}`}>
        <div className="flex items-start gap-3">
          {config.icon}
          <div>
            <p className={`font-semibold text-sm ${config.titleColor}`}>{config.title}</p>
            <p className={`text-xs mt-0.5 ${config.textColor}`}>{verifyResult.summary}</p>
            {verifyResult.flags.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {verifyResult.flags.map((f, i) => (
                  <li key={i} className={`text-xs ${config.textColor}`}>• {f}</li>
                ))}
              </ul>
            )}
            {verifyResult.verdict !== "verified" && (
              <p className="text-xs mt-2 text-gray-500">
                You can still proceed — a provider will review your identity before your medication ships.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Identity Verification</h2>
        <p className="text-gray-500 text-sm mb-8">
          Upload a photo ID and record a short 10-second video holding your ID. Our AI will verify they match. You can still proceed if you skip — a provider will review before your medication ships.
        </p>

        {/* ── License Upload ── */}
        <div className="mb-7">
          <h3 className="font-semibold text-gray-800 mb-1">Government Photo ID</h3>
          <p className="text-xs text-gray-400 mb-3">Clear photo of the front of your driver&apos;s license or passport</p>

          <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all duration-200">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleLicenseUpload(e.target.files[0]); }}
            />
            {licenseUploaded ? (
              <div>
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-600">ID Uploaded</p>
                {licensePreview && (
                  <img src={licensePreview} alt="ID preview" className="mt-3 max-h-28 mx-auto rounded-lg object-cover" />
                )}
                <p className="text-xs text-gray-400 mt-2">Click to replace</p>
              </div>
            ) : (
              <div>
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">Click to upload ID photo</p>
                <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 10MB</p>
              </div>
            )}
          </label>
        </div>

        {/* ── Identity Video ── */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">10-Second Identity Video</h3>
          <p className="text-xs text-gray-400 mb-3">Record or upload a short video holding your ID so AI can confirm you match</p>

          {selfieUploaded ? (
            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-6 text-center">
              {selfiePreview && (
                <img src={selfiePreview} alt="Video frame" className="w-32 h-24 object-cover mx-auto rounded-lg mb-3" />
              )}
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-1" />
              <p className="font-semibold text-green-700 text-sm">Video captured</p>
              <button onClick={resetSelfie} className="text-xs text-gray-400 mt-2 hover:text-gray-600 underline">
                Re-record
              </button>
            </div>
          ) : recording ? (
            <div className="border-2 border-red-300 bg-red-50 rounded-xl p-4 text-center">
              <video
                ref={liveVideoRef}
                muted
                playsInline
                className="w-full max-h-48 object-cover rounded-lg mb-3 bg-black"
              />
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-600 font-semibold text-sm">Recording... {recordingSeconds}s / 10s (auto-stops)</span>
              </div>
              <div className="w-full bg-red-100 rounded-full h-1.5 mb-3">
                <div
                  className="bg-red-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${(recordingSeconds / 10) * 100}%` }}
                />
              </div>
              <Button variant="outline" onClick={stopRecording} size="sm">
                Stop &amp; Use This
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center space-y-4">
              {/* Live preview placeholder */}
              <video ref={liveVideoRef} muted playsInline className="hidden" />
              <Video className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-600 text-sm">Record a 10-second video holding your ID in front of the camera</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={startRecording} size="sm">
                  <Video className="w-4 h-4 mr-2" />
                  Start Recording
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleVideoUpload(e.target.files[0]); }}
                  />
                  <span className="inline-flex items-center gap-2 px-4 py-2 border-2 border-teal-600 text-teal-600 rounded-xl text-sm font-semibold hover:bg-teal-50 transition-all cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload Video
                  </span>
                </label>
              </div>
              <p className="text-xs text-gray-400">MP4, MOV, WebM · max 30 seconds</p>
            </div>
          )}
        </div>

        <VerificationBadge />
      </div>

      <div className="flex gap-3">
        <Button fullWidth variant="outline" onClick={() => router.push("/start/consent")}>
          Back
        </Button>
        <Button fullWidth onClick={handleContinue} disabled={verifying}>
          {verifying
            ? "Verifying..."
            : licenseUploaded && selfieUploaded
            ? "Continue →"
            : "Skip for Now"}
        </Button>
      </div>
    </div>
  );
}
