"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";

export default function PatientInfo() {
  const router = useRouter();
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [formData, setFormData] = useState(getIntakeState());
  const [selectedDose, setSelectedDose] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setProducts(db.productDb.getActive());
  }, []);

  useEffect(() => {
    if (formData.productId) {
      const product = db.productDb.getById(formData.productId);
      if (product && product.doses.length > 0 && !selectedDose) {
        setSelectedDose(product.doses[0].id);
      }
    }
  }, [formData.productId]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = "Required";
    if (!formData.lastName.trim()) newErrors.lastName = "Required";
    if (!formData.email.trim()) newErrors.email = "Required";
    if (!formData.phone.trim()) newErrors.phone = "Required";
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
    saveIntakeState({ ...formData, doseId: selectedDose, shippingAddress: formData.shippingAddress || formData.address });
    router.push("/start/questionnaire");
  };

  const updateField = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateAddress = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));

  const selectedProduct = formData.productId ? db.productDb.getById(formData.productId) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product Selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Choose Your Treatment</h2>
        <p className="text-gray-500 text-sm mb-6">Select the treatment you're interested in</p>

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
              label="Dosage"
              options={selectedProduct.doses.map((d) => ({
                value: d.id,
                label: `${d.label} - $${d.price}/month`,
              }))}
              value={selectedDose}
              onChange={(e) => setSelectedDose(e.target.value)}
            />
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
            <Input label="Phone" autoComplete="tel" inputMode="tel" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} error={errors.phone} placeholder="(555) 000-0000" />
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
            <Input label="State" autoComplete="shipping address-level1" value={formData.address.state} onChange={(e) => updateAddress("state", e.target.value)} error={errors.state} placeholder="CA" />
            <Input label="ZIP Code" autoComplete="shipping postal-code" inputMode="numeric" value={formData.address.zipCode} onChange={(e) => updateAddress("zipCode", e.target.value)} error={errors.zipCode} placeholder="90210" />
          </div>
        </div>
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
