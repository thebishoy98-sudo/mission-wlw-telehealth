"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getIntakeState, saveIntakeState, type IntakeFormState } from "@/lib/intake-store";
import { buildTreatmentConsentText, doesSignatureMatchPatient, patientLegalName } from "@/lib/consent";
import { Shield } from "lucide-react";

export default function Consent() {
  const router = useRouter();
  const [intakeState, setIntakeState] = useState<IntakeFormState | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = getIntakeState();
    setIntakeState(saved);
    setSignedName(saved.signedName || "");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const activeIntakeState = intakeState ?? getIntakeState();
    const newErrors: Record<string, string> = {};
    if (!signedName.trim()) newErrors.signedName = "Please type your full name to sign";
    if (signedName.trim() && signedName.trim().split(/\s+/).length < 2) {
      newErrors.signedName = "Please enter your first and last name";
    }
    if (
      signedName.trim() &&
      !newErrors.signedName &&
      patientLegalName(activeIntakeState) &&
      !doesSignatureMatchPatient(signedName, activeIntakeState)
    ) {
      newErrors.signedName = `Signature must match the patient name: ${patientLegalName(activeIntakeState)}`;
    }
    if (!acknowledged) newErrors.acknowledged = "You must agree to continue";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    saveIntakeState({ signedName: signedName.trim(), consented: true, consentSignedAt: new Date().toISOString() });
    router.push("/start/uploads");
  };

  const consentText = buildTreatmentConsentText(intakeState ?? { firstName: "", lastName: "", dateOfBirth: "" });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-forest-800" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Consent & Privacy</h2>
            <p className="text-gray-400 text-xs">Required before your provider review</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-5 mb-6 max-h-80 overflow-y-auto border border-gray-100">
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{consentText}</p>
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 has-[:checked]:border-green-200 has-[:checked]:bg-green-50 transition-all">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-forest-800"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I have carefully read and agree to the consent terms above. I understand my rights and consent to this treatment.
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
