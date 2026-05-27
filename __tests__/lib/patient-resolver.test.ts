import { preferCompletePatientForIntegrations } from "@/lib/patient-resolver";
import type { Patient } from "@/types";

const fullPatient: Patient = {
  id: "patient_1",
  firstName: "Allen",
  lastName: "Test",
  dateOfBirth: "1980-01-01",
  gender: "male",
  phone: "5555555555",
  email: "allen@example.com",
  address: {
    street1: "100 Main St",
    city: "Dallas",
    state: "TX",
    zipCode: "75201",
    country: "US",
  },
  shippingAddress: {
    street1: "100 Main St",
    city: "Dallas",
    state: "TX",
    zipCode: "75201",
    country: "US",
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

describe("preferCompletePatientForIntegrations", () => {
  it("uses submitted checkout patient data when the resolved patient is only a stub", () => {
    const stub = {
      ...fullPatient,
      firstName: "",
      lastName: "",
      phone: "",
      address: { ...fullPatient.address, street1: "" },
    };

    expect(preferCompletePatientForIntegrations(stub, fullPatient)).toBe(fullPatient);
  });

  it("keeps a complete resolved patient as the source of truth", () => {
    const submitted = { ...fullPatient, firstName: "Submitted" };

    expect(preferCompletePatientForIntegrations(fullPatient, submitted)).toBe(fullPatient);
  });

  it("falls back to the available patient when neither side is complete", () => {
    const stub = { ...fullPatient, firstName: "" };

    expect(preferCompletePatientForIntegrations(stub, null)).toBe(stub);
  });
});
