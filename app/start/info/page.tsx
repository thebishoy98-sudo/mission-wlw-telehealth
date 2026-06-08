"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { formatCurrency } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];

const STEPS = [
  { id: "treatment", title: "Choose your treatment", subtitle: "Select the medication you're interested in" },
  { id: "name", title: "What's your name?", subtitle: "As it appears on your ID" },
  { id: "contact", title: "How can we reach you?", subtitle: "For prescription updates and shipping notifications" },
  { id: "details", title: "A little about you", subtitle: "Required for your prescription" },
  { id: "address", title: "Shipping address", subtitle: "Where should we send your treatment?" },
  { id: "consent", title: "Almost done", subtitle: "Review and confirm" },
];

export default function PatientInfo() {
  const router = useRouter();
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [formData, setFormData] = useState(getIntakeState());
  const [selectedDose, setSelectedDose] = useState<string>("");
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("productId");
    if (productId) setFormData((prev) => ({ ...prev, productId }));
  }, []);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => setProducts(payload.products ?? []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!formData.productId) return;
    const product = products.find((p) => p.id === formData.productId);
    if (!product) return;
    const doseIds = product.doses.map((d) => d.id);
    if (selectedDose && doseIds.includes(selectedDose)) return;
    setSelectedDose(
      formData.doseId && doseIds.includes(formData.doseId)
        ? formData.doseId
        : product.doses[0]?.id ?? ""
    );
  }, [formData.productId, formData.doseId, products, selectedDose]);

  useEffect(() => {
    const zip = formData.address.zipCode;
    if (zip.length !== 5) return;
    fetch(`https://api.zippopotam.us/us/${zip}`)
      .then((r) => r.json())
      .then((data) => {
        const place = data?.places?.[0];
        if (place) {
          setFormData((prev) => ({
            ...prev,
            address: {
              ...prev.address,
              city: place["place name"] || prev.address.city,
              state: place["state abbreviation"] || prev.address.state,
            },
          }));
        }
      })
      .catch(() => {});
  }, [formData.address.zipCode]);

  const updateField = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateAddress = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!formData.productId) e.productId = "Please select a treatment";
    }
    if (s === 1) {
      if (!formData.firstName.trim()) e.firstName = "Required";
      if (!formData.lastName.trim()) e.lastName = "Required";
    }
    if (s === 2) {
      if (!formData.email.trim()) e.email = "Required";
      else if (!EMAIL_REGEX.test(formData.email.trim())) e.email = "Enter a valid email address";
      const digits = formData.phone.replace(/\D/g, "");
      if (!formData.phone.trim()) e.phone = "Required";
      else if (digits.length !== 10) e.phone = "Enter a valid 10-digit US phone number";
    }
    if (s === 3) {
      if (!formData.dateOfBirth) e.dateOfBirth = "Required";
      if (!formData.gender) e.gender = "Required";
    }
    if (s === 4) {
      if (!formData.address.street1) e.street1 = "Required";
      if (!formData.address.city) e.city = "Required";
      if (!formData.address.state) e.state = "Required";
      if (!formData.address.zipCode) e.zipCode = "Required";
    }
    return e;
  };

  const advance = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (step < STEPS.length - 1) { setStep((s) => s + 1); return; }
    // Final step submit
    saveIntakeState({
      ...formData,
      doseId: selectedDose,
      shippingAddress: formData.shippingAddress || formData.address,
      isReorder: false,
      reorderSourceOrderId: undefined,
    });
    fetch("/api/intake/save-partial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: formData.phone, email: formData.email, firstName: formData.firstName }),
    }).catch(() => {});
    router.push("/start/questionnaire");
  };

  const selectedProduct = formData.productId ? products.find((p) => p.id === formData.productId) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Progress dots */}
      <div className="flex items-center justify-between gap-1.5 px-1">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-forest-800" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">Step {step + 1} of {STEPS.length}</p>

      {/* Step card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{STEPS[step].title}</h2>
        <p className="text-gray-500 text-sm mb-7">{STEPS[step].subtitle}</p>

        {step === 0 && (
          <div className="space-y-5">
            <Select
              label="Treatment"
              options={[{ value: "", label: "Select a treatment..." }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
              value={formData.productId}
              onChange={(e) => { updateField("productId", e.target.value); setSelectedDose(""); }}
              error={errors.productId}
            />
            {selectedProduct && (
              <div>
                <Select
                  label="Prescription option"
                  options={selectedProduct.doses.map((d) => ({
                    value: d.id,
                    label: `${d.label} - ${d.patientDescription ?? d.strength} - ${formatCurrency(d.price)}`,
                  }))}
                  value={selectedDose}
                  onChange={(e) => setSelectedDose(e.target.value)}
                />
                <p className="mt-2 text-xs text-gray-400">
                  8-week prescription. Your provider confirms the dose before dispatch.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="First Name" autoComplete="given-name" value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} error={errors.firstName} placeholder="Jane" />
            <Input label="Last Name" autoComplete="family-name" value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} error={errors.lastName} placeholder="Smith" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Input label="Email address" type="email" autoComplete="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} error={errors.email} placeholder="jane@email.com" />
            <Input label="Mobile phone" type="tel" autoComplete="tel" inputMode="tel" value={formData.phone} onChange={(e) => updateField("phone", formatPhone(e.target.value))} error={errors.phone} placeholder="(555) 000-0000" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Input label="Date of Birth" type="date" autoComplete="bday" value={formData.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} error={errors.dateOfBirth} />
            <Select
              label="Biological Sex"
              options={[
                { value: "", label: "Select..." },
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
                { value: "other", label: "Other / Prefer not to say" },
              ]}
              value={formData.gender}
              onChange={(e) => updateField("gender", e.target.value)}
              error={errors.gender}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <Input label="Street Address" autoComplete="shipping address-line1" value={formData.address.street1} onChange={(e) => updateAddress("street1", e.target.value)} error={errors.street1} placeholder="123 Main St" />
            <Input label="Apt, Suite (Optional)" autoComplete="shipping address-line2" value={formData.address.street2 || ""} onChange={(e) => updateAddress("street2", e.target.value)} placeholder="Apt 4B" />
            <Input label="ZIP Code" autoComplete="shipping postal-code" inputMode="numeric" maxLength={5} value={formData.address.zipCode} onChange={(e) => updateAddress("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))} error={errors.zipCode} placeholder="90210" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="City" autoComplete="shipping address-level2" value={formData.address.city} onChange={(e) => updateAddress("city", e.target.value)} error={errors.city} />
              <Select
                label="State"
                options={[{ value: "", label: "State..." }, ...US_STATES.map(([code, name]) => ({ value: code, label: `${code} - ${name}` }))]}
                value={formData.address.state}
                onChange={(e) => updateAddress("state", e.target.value)}
                error={errors.state}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2 text-sm text-gray-600">
              <p><span className="font-semibold text-gray-900">Treatment:</span> {selectedProduct?.name ?? "—"}</p>
              <p><span className="font-semibold text-gray-900">Name:</span> {formData.firstName} {formData.lastName}</p>
              <p><span className="font-semibold text-gray-900">Email:</span> {formData.email}</p>
              <p><span className="font-semibold text-gray-900">Phone:</span> {formData.phone}</p>
              <p><span className="font-semibold text-gray-900">Ships to:</span> {formData.address.street1}, {formData.address.city}, {formData.address.state} {formData.address.zipCode}</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-forest-800 focus:ring-forest-700 cursor-pointer"
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                I agree to receive treatment updates, dosing reminders, and wellness tips via text message from Mission WLW. Standard messaging rates may apply. Reply STOP to opt out.
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
            Back
          </Button>
        ) : (
          <Button variant="outline" onClick={() => router.push("/")} className="flex-1">
            Cancel
          </Button>
        )}
        <Button onClick={advance} className="flex-1">
          {step < STEPS.length - 1 ? "Continue" : "Submit and continue"}
        </Button>
      </div>
    </div>
  );
}
