"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { Shield } from "lucide-react";

const CONSENT_TEXT = `By proceeding, I consent to telemedicine services from a licensed healthcare provider. I understand that:

- I am receiving telehealth services and may interact with licensed medical professionals remotely.
- My health information will be collected and used solely for treatment purposes.
- I have the right to refuse or discontinue treatment at any time.
- Telehealth services may not be appropriate for all medical conditions.
- My data is handled in accordance with HIPAA and our Privacy Policy.

I authorize the collection, use, and disclosure of my health information as necessary for my care. I confirm that the information I have provided is accurate and complete to the best of my knowledge.`;

export default function Consent() {
  const router = useRouter();
  const [signedName, setSignedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setSignedName(getIntakeState().signedName || "");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!signedName.trim()) newErrors.signedName = "Please type your full name to sign";
    if (!acknowledged) newErrors.acknowledged = "You must agree to continue";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    saveIntakeState({ signedName, consented: true });
    router.push("/start/uploads");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Consent & Privacy</h2>
            <p className="text-gray-400 text-xs">Required before your provider review</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-5 mb-6 max-h-56 overflow-y-auto border border-gray-100">
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{CONSENT_TEXT}</p>
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 has-[:checked]:border-teal-300 has-[:checked]:bg-teal-50 transition-all">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-teal-600"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I have read and agree to the terms above. I understand my rights and consent to telemedicine services.
            </span>
          </label>
          {errors.acknowledged && <p className="text-sm text-red-500">{errors.acknowledged}</p>}

          <Input
            label="Full Name (Digital Signature)"
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="Type your full legal name"
            error={errors.signedName}
          />

          <p className="text-xs text-gray-400">
            Signed electronically on {new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button fullWidth variant="outline" type="button" onClick={() => router.push("/start/questionnaire")}>
          Back
        </Button>
        <Button fullWidth type="submit">Continue</Button>
      </div>
    </form>
  );
}
