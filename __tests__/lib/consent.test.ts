import {
  buildConsentCertificate,
  buildTreatmentConsentText,
  doesSignatureMatchPatient,
  maskIpAddress,
} from "@/lib/consent";
import type { ConsentRecord, Patient } from "@/types";

const patient: Patient = {
  id: "patient_1",
  firstName: "Bishoy",
  lastName: "Kamel",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "17328228376",
  email: "bishoy@example.com",
  address: { street1: "1 Main", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
  shippingAddress: { street1: "1 Main", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

// Signature field validation: requires at least two whitespace-separated words.
// Case and extra spacing are irrelevant — any casing is accepted.
const hasMinTwoWords = (name: string) => name.trim().split(/\s+/).length >= 2;

describe("consent signature field validation", () => {
  it("accepts any casing with at least two words", () => {
    expect(hasMinTwoWords("John Doe")).toBe(true);
    expect(hasMinTwoWords("john doe")).toBe(true);
    expect(hasMinTwoWords("JOHN DOE")).toBe(true);
    expect(hasMinTwoWords("  John   Doe  ")).toBe(true);
    expect(hasMinTwoWords("John Michael Doe")).toBe(true);
  });

  it("rejects a single word or blank input", () => {
    expect(hasMinTwoWords("John")).toBe(false);
    expect(hasMinTwoWords("")).toBe(false);
    expect(hasMinTwoWords("   ")).toBe(false);
  });
});

describe("treatment consent helpers", () => {
  it("doesSignatureMatchPatient is case-insensitive and collapses extra spaces", () => {
    expect(doesSignatureMatchPatient("Bishoy Kamel", patient)).toBe(true);
    expect(doesSignatureMatchPatient("bishoy   kamel", patient)).toBe(true);
    expect(doesSignatureMatchPatient("BK", patient)).toBe(false);
  });

  it("renders treatment-specific consent text with patient identity", () => {
    const text = buildTreatmentConsentText(patient);

    expect(text).toContain("CONSENT FOR MEDICAL TREATMENT");
    expect(text).toContain("Patient Name: Bishoy Kamel");
    expect(text).toContain("Date of Birth: 04/14/1998");
    expect(text).toContain("Tirzepatide");
    expect(text).toContain("Treatment Liability Waiver");
  });

  it("builds an audit certificate with a masked IP address", () => {
    const consent: ConsentRecord = {
      id: "consent_1",
      orderId: "order_1",
      consentText: "terms",
      acknowledgments: { telehealth: true, pharmacy: true, payment: true, privacy: true },
      signedName: "Bishoy Kamel",
      signedAt: "2026-05-31T16:21:00.000Z",
      ipAddress: "74.220.48.123",
      userAgent: "Browser",
      consentVersion: "tirzepatide-fl-v1",
    };

    expect(maskIpAddress("74.220.48.123")).toBe("74.220.48.***");
    expect(buildConsentCertificate(consent, patient)).toContain(
      "e-signed by Bishoy Kamel on May 31, 2026"
    );
    expect(buildConsentCertificate(consent, patient)).toContain("from IP 74.220.48.***");
  });
});
