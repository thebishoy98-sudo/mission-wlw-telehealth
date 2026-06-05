"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { IdentityCapture, type IdentityCaptureValue } from "@/components/identity/IdentityCapture";
import { Button } from "@/components/ui/Button";
import { saveIntakeState } from "@/lib/intake-store";

export default function Uploads() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityCaptureValue>({
    idImageData: "",
    identityVideoFrameData: "",
    identityVideoData: "",
    complete: false,
  });

  const handleIdentityChange = useCallback((value: IdentityCaptureValue) => {
    setIdentity(value);
  }, []);

  const handleContinue = () => {
    saveIntakeState({
      licenseUploaded: !!identity.idImageData,
      selfieUploaded: !!identity.identityVideoFrameData && !!identity.identityVideoData,
      licenseImageData: identity.idImageData,
      selfieFrameData: identity.identityVideoFrameData,
      identityVideoData: identity.identityVideoData,
    });
    router.push("/start/payment");
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Identity Verification</h2>
        <p className="text-gray-500 text-sm mb-8">
          Take a clear photo of your government ID, then record a short video stating your name, date of birth, and current weight. This helps your provider verify your identity before pharmacy dispatch.
        </p>
        <IdentityCapture onChange={handleIdentityChange} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button fullWidth variant="outline" onClick={() => router.push("/start/consent")}>
          Back
        </Button>
        <Button fullWidth onClick={handleContinue}>
          {identity.complete ? "Continue ->" : "Skip for Now"}
        </Button>
      </div>
    </div>
  );
}
