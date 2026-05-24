"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { saveIntakeState } from "@/lib/intake-store";
import { Upload, CheckCircle, Video } from "lucide-react";

export default function Uploads() {
  const router = useRouter();
  const [licenseUploaded, setLicenseUploaded] = useState(false);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [licensePreview, setLicensePreview] = useState<string>("");
  const [licenseImageData, setLicenseImageData] = useState<string>("");
  const [selfieFrameData, setSelfieFrameData] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLicenseUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setLicensePreview(dataUrl);
      setLicenseImageData(dataUrl);
      setLicenseUploaded(true);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (file: File) => {
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
      setSelfieUploaded(true);
      URL.revokeObjectURL(url);
    };
  };

  const startMockRecording = () => {
    setRecording(true);
    setRecordingSeconds(0);
    let secs = 0;
    timerRef.current = setInterval(() => {
      secs++;
      setRecordingSeconds(secs);
      if (secs >= 10) {
        stopRecording();
      }
    }, 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setSelfieUploaded(true);
    setSelfieFrameData("");
  };

  const handleContinue = () => {
    saveIntakeState({
      licenseUploaded,
      selfieUploaded,
      licenseImageData,
      selfieFrameData,
    });
    router.push("/start/payment");
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Identity Verification</h2>
        <p className="text-gray-500 text-sm mb-8">
          Upload a photo ID and record a short selfie video. This helps our provider verify your identity. Both are optional for demo.
        </p>

        {/* License Upload */}
        <div className="mb-7">
          <h3 className="font-semibold text-gray-800 mb-1">Driver's License or Government ID</h3>
          <p className="text-xs text-gray-400 mb-3">Clear photo of the front of your ID</p>

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

        {/* Selfie Video */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">10-Second Identity Video</h3>
          <p className="text-xs text-gray-400 mb-3">Record yourself holding your ID so the provider can verify your identity</p>

          {selfieUploaded ? (
            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-6 text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-green-700">Video recorded</p>
              <button onClick={() => setSelfieUploaded(false)} className="text-xs text-gray-400 mt-2 hover:text-gray-600">
                Re-record
              </button>
            </div>
          ) : recording ? (
            <div className="border-2 border-red-300 bg-red-50 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-600 font-semibold">Recording... {recordingSeconds}s / 10s</span>
              </div>
              <div className="w-full bg-red-100 rounded-full h-2 mb-4">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${(recordingSeconds / 10) * 100}%` }}
                />
              </div>
              <Button variant="outline" onClick={stopRecording} size="sm">
                Stop Recording
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center space-y-4">
              <Video className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-600 text-sm">Record a 10-second video holding your ID</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={startMockRecording} size="sm">
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
              <p className="text-xs text-gray-400">MP4, MOV accepted · max 30 seconds</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button fullWidth variant="outline" onClick={() => router.push("/start/consent")}>
          Back
        </Button>
        <Button fullWidth onClick={handleContinue}>
          {licenseUploaded && selfieUploaded ? "Continue →" : "Skip for Now"}
        </Button>
      </div>
    </div>
  );
}
