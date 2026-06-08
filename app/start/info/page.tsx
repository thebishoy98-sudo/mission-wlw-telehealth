"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function PatientInfo() {
  const router = useRouter();
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [formData, setFormData] = useState(getIntakeState());
  const [selectedDose, setSelectedDose] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-select product from URL param (e.g. ?productId=product_tirzepatide)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("productId");
    if (productId) {
      setFormData((prev) => ({ ...prev, productId }));
    }
  }, []);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setProducts(payload.products ?? []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (formData.productId) {
      const product = products.find((item) => item.id === formData.productId);
      if (product && product.doses.length > 0) {
        const doseIds = product.doses.map((dose) => dose.id);
        if (!selectedDose || !doseIds.includes(selectedDose)) {
          if (formData.doseId && doseIds.includes(formData.doseId)) {
            setSelectedDose(formData.doseId);
          } else {
            setSelectedDose(product.doses[0].id);
          }
        }
      }
    }
  }, [formData.productId, formData.doseId, products, selectedDose]);

  // Auto-fill city & state when a valid 5-digit ZIP is entered
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = "Required";
    if (!formData.lastName.trim()) newErrors.lastName = "Required";
    if (!formData.email.trim()) {
      newErrors.email = "Required";
    } else if (!EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = "Enter a valid email address";
    }
    const phoneDigits = formData.phone.replace(/\D/g, "");
    if (!formData.phone.trim()) {
      newErrors.phone = "Required";
    } else if (phoneDigits.length !== 10) {
      newErrors.phone = "Enter a valid 10-digit US phone number";
    }
    if (!formData.dateOfBirth) newErrors.dateOfBirth = "Required";
    if (!formData.gender) newErrors.gender = "Required";
    if (!formData.address.street1) newErrors.street1 = "Required";
    if (!formData.address.city) newErrors.city = "Required";
    if (!formData.address.state) newErrors.state = "Required";
    if (!formData.address.zipCode) newErrors.zipCode = "Required";
    if (!formData.productId) newErrors.productId = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    saveIntakeState({
      ...formData,
      doseId: selectedDose,
      shippingAddress: formData.shippingAddress || formData.address,
      isReorder: false,
      reorderSourceOrderId: undefined,
    });
    // Fire-and-forget: save partial intake for abandonment recovery SMS
    fetch("/api/intake/save-partial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: formData.phone, email: formData.email, firstName: formData.firstName }),
    }).catch(() => {});
    router.push("/start/questionnaire");
  };

  const updateField = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateAddress = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));

  const selectedProduct = formData.productId ? products.find((item) => item.id === formData.productId) ?? null : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product Selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Choose Your Treatment</h2>
        <p className="text-gray-500 text-sm mb-6">Select the treatment you&apos;re interested in</p>

        <Select
          label="Treatment"
          options={[{ value: "", label: "Select a treatment..." }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
          value={formData.productId}
          onChange={(e) => updateField("productId", e.target.value)}
          error={errors.productId}
        />

        {selectedProduct && (
          <div className="mt-4">
            <Select
              label="Prescription option"
              options={selectedProduct.doses.map((d) => ({
                value: d.id,
                label: `${d.label} - ${d.patientDescription ?? d.strength} - ${formatCurrency(d.price)}`,
              }))}
              value={selectedDose}
              onChange={(e) => setSelectedDose(e.target.value)}
            />
            <p className="mt-2 text-xs text-gray-500">
              These are 8-week prescription options. Your provider reviews the dose before the order is sent.
            </p>
          </div>
        )}
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Personal Information</h2>
        <p className="text-gray-500 text-sm mb-6">Used to create your patient profile</p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First Name" autoComplete="given-name" value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} error={errors.firstName} placeholder="Jane" />
            <Input label="Last Name" autoComplete="family-name" value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} error={errors.lastName} placeholder="Smith" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" autoComplete="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} error={errors.email} placeholder="jane@email.com" />
            <Input label="Phone" type="tel" autoComplete="tel" inputMode="tel" value={formData.phone} onChange={(e) => updateField("phone", formatPhone(e.target.value))} error={errors.phone} placeholder="(555) 000-0000" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Date of Birth" type="date" autoComplete="bday" value={formData.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} error={errors.dateOfBirth} />
            <Select
              label="Sex"
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
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Shipping Address</h2>
        <p className="text-gray-500 text-sm mb-6">Where should we send your treatment?</p>

        <div className="space-y-4">
          <Input label="Street Address" autoComplete="shipping address-line1" value={formData.address.street1} onChange={(e) => updateAddress("street1", e.target.value)} error={errors.street1} placeholder="123 Main St" />
          <Input label="Apt, Suite (Optional)" autoComplete="shipping address-line2" value={formData.address.street2 || ""} onChange={(e) => updateAddress("street2", e.target.value)} placeholder="Apt 4B" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="City" autoComplete="shipping address-level2" value={formData.address.city} onChange={(e) => updateAddress("city", e.target.value)} error={errors.city} />
            <Select
              label="State"
              options={[{ value: "", label: "State..." }, ...US_STATES.map(([code, name]) => ({ value: code, label: `${code} – ${name}` }))]}
              value={formData.address.state}
              onChange={(e) => updateAddress("state", e.target.value)}
              error={errors.state}
            />
            <Input label="ZIP Code" autoComplete="shipping postal-code" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={formData.address.zipCode} onChange={(e) => updateAddress("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))} error={errors.zipCode} placeholder="90210" />
          </div>
        </div>
      </div>

      {/* SMS opt-in */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-forest-800 focus:ring-forest-700 cursor-pointer"
          />
          <span className="text-sm text-gray-600 leading-relaxed">
            I agree to receive treatment updates, dosing reminders, and wellness tips via text message from Mission WLW. Standard messaging rates may apply. You can opt out at any time by replying STOP.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="flex-1">
          <Button fullWidth variant="outline">Cancel</Button>
        </Link>
        <Button fullWidth type="submit">
          Continue
        </Button>
      </div>
    </form>
  );
}
