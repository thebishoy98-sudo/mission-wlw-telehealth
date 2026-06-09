"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { AlertCircle, Camera, CheckCircle, Flashlight, FlashlightOff, ShieldCheck, Video } from "lucide-react";

const RECORDING_SECONDS = 15;
const MAX_IMAGE_WIDTH = 1200;
const VIDEO_BITS_PER_SECOND = 180_000;
export const MAX_VIDEO_DATA_URL_BYTES = 3_500_000;

export interface IdentityCaptureValue {
  idImageData: string;
  identityVideoFrameData: string;
  identityVideoData: string;
  complete: boolean;
}

interface IdentityCaptureProps {
  onChange: (value: IdentityCaptureValue) => void;
  showIntro?: boolean;
}

const dataUrlFromVideo = (video: HTMLVideoElement, quality = 0.82) => {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const scale = Math.min(1, MAX_IMAGE_WIDTH / sourceWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
};

const identityVideoConstraints: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 360, max: 480 },
    height: { ideal: 480, max: 640 },
    frameRate: { ideal: 15, max: 20 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
};

const mediaRecorderOptions = (): MediaRecorderOptions => {
  const candidates = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  return {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: 24_000,
  };
};

export function IdentityCapture({ onChange, showIntro = true }: IdentityCaptureProps) {
  const idVideoRef = useRef<HTMLVideoElement | null>(null);
  const idStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [idImageData, setIdImageData] = useState("");
  const [idCameraOpen, setIdCameraOpen] = useState(false);
  const [identityVideoFrameData, setIdentityVideoFrameData] = useState("");
  const [identityVideoData, setIdentityVideoData] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [captureError, setCaptureError] = useState("");
  const [idTorchSupported, setIdTorchSupported] = useState(false);
  const [idTorchOn, setIdTorchOn] = useState(false);

  useEffect(() => {
    onChange({
      idImageData,
      identityVideoFrameData,
      identityVideoData,
      complete: !!idImageData && !!identityVideoFrameData && !!identityVideoData,
    });
  }, [idImageData, identityVideoFrameData, identityVideoData, onChange]);

  const stopIdCamera = () => {
    idStreamRef.current?.getTracks().forEach((track) => track.stop());
    idStreamRef.current = null;
    setIdTorchOn(false);
    setIdTorchSupported(false);
    setIdCameraOpen(false);
  };

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      stopIdCamera();
      stopCamera();
    };
  }, []);

  const startIdCamera = async () => {
    setCaptureError("");
    try {
      setIdCameraOpen(true);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      idStreamRef.current = stream;
      const [track] = stream.getVideoTracks();
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setIdTorchSupported(!!capabilities?.torch);
      if (idVideoRef.current) {
        idVideoRef.current.srcObject = stream;
        await idVideoRef.current.play().catch(() => {});
      }
    } catch {
      stopIdCamera();
      setCaptureError("Camera access was blocked. Please allow camera access and try again.");
    }
  };

  const captureIdPhoto = () => {
    const video = idVideoRef.current;
    if (!video) return;
    setIdImageData(dataUrlFromVideo(video));
    stopIdCamera();
  };

  const toggleIdTorch = async () => {
    const [track] = idStreamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const next = !idTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setIdTorchOn(next);
    } catch {
      setIdTorchSupported(false);
      setCaptureError("Flashlight is not available on this camera.");
    }
  };

  const resetVideoCapture = () => {
    setIdentityVideoFrameData("");
    setIdentityVideoData("");
    setRecordingSeconds(0);
  };

  const captureVideoFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    setIdentityVideoFrameData(dataUrlFromVideo(video));
  };

  const startRecording = async () => {
    setCaptureError("");
    resetVideoCapture();
    try {
      setRecording(true);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const stream = await navigator.mediaDevices.getUserMedia(identityVideoConstraints);
      streamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream, mediaRecorderOptions());
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "video/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result ?? "");
          if (dataUrl.length > MAX_VIDEO_DATA_URL_BYTES) {
            resetVideoCapture();
            setCaptureError("The video file is too large. Please re-record in steady light and keep the phone still.");
            return;
          }
          setIdentityVideoData(dataUrl);
        };
        reader.readAsDataURL(blob);
      };
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      recorder.start();
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
      setRecording(false);
      setCaptureError("Camera or microphone access was blocked. Please allow access and try again.");
    }
  };

  const progress = Math.min(100, (recordingSeconds / RECORDING_SECONDS) * 100);

  return (
    <div className="space-y-6">
      {showIntro && (
        <div className="rounded-lg border border-green-50 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-forest-800" />
            <p className="text-sm text-forest-900">
              Take a clear ID photo, then record a short video mentioning your name, date of birth, and current weight.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Government ID</h2>
          <p className="text-xs text-gray-500 mt-1">
            Place the ID inside the frame on a dark flat surface. Keep all corners visible and avoid glare.
          </p>
        </div>

        {idCameraOpen ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-lg bg-gray-900">
              <video ref={idVideoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="aspect-[1.586/1] w-full max-w-md rounded-xl border-4 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="button" fullWidth onClick={captureIdPhoto}>
                <Camera className="h-4 w-4 mr-2" />
                Capture ID Photo
              </Button>
              {idTorchSupported && (
                <Button type="button" fullWidth variant="outline" onClick={toggleIdTorch}>
                  {idTorchOn ? <FlashlightOff className="h-4 w-4 mr-2" /> : <Flashlight className="h-4 w-4 mr-2" />}
                  {idTorchOn ? "Flash Off" : "Flash On"}
                </Button>
              )}
              <Button type="button" fullWidth variant="outline" onClick={stopIdCamera}>
                Cancel
              </Button>
            </div>
          </div>
        ) : idImageData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">
              <CheckCircle className="h-5 w-5" />
              ID photo ready
            </div>
            <div className="relative h-44 w-full overflow-hidden rounded-lg bg-gray-50">
              <Image src={idImageData} alt="Government ID preview" fill unoptimized className="object-contain" />
            </div>
            <Button type="button" fullWidth variant="outline" onClick={() => setIdImageData("")}>
              Retake ID Photo
            </Button>
          </div>
        ) : (
          <Button type="button" fullWidth onClick={startIdCamera}>
            <Camera className="h-4 w-4 mr-2" />
            Open Camera
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">15-Second Verification Video</h2>
          <p className="text-xs text-gray-500 mt-1">
            Please upload a quick video mentioning your name, date of birth, and current weight if interested in weight loss.
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
              <div className="h-2 rounded-full bg-forest-800 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {identityVideoFrameData && !recording ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">
              <CheckCircle className="h-5 w-5" />
              Video recorded
            </div>
            {identityVideoData && <video controls playsInline src={identityVideoData} className="w-full rounded-lg bg-gray-100" />}
          </div>
        ) : null}
        <Button type="button" onClick={recording ? stopCamera : startRecording} variant={recording ? "outline" : "primary"}>
          <Video className="h-4 w-4 mr-2" />
          {recording ? "Stop Recording" : identityVideoData ? "Re-record Video" : "Start Recording"}
        </Button>
      </div>

      {captureError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {captureError}
          </span>
        </div>
      )}
    </div>
  );
}
