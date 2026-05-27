import {
  buildPracticeQPatientStartUrl,
  createPracticeQAutomationJob,
  isPracticeQAutomationReady,
} from "@/services/practiceq-automation";
import type { Order, Patient } from "@/types";

const patient: Patient = {
  id: "patient_1",
  firstName: "Bishoy",
  lastName: "Kamel",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "thebishoy98@gmail.com",
  address: { street1: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  shippingAddress: { street1: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const paidOrder: Order = {
  id: "order_paid",
  patientId: patient.id,
  productId: "product_1",
  doseId: "dose_1",
  status: "pending_review",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "invoiced",
  identityStatus: "verified",
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

describe("PracticeQ browser automation jobs", () => {
  it("builds a patient-visible PracticeQ start URL with only demographic prefill", () => {
    expect(buildPracticeQPatientStartUrl(patient)).toBe(
      "https://intakeq.com/new/yjvht0?Name=Bishoy+Kamel&Email=thebishoy98%40gmail.com"
    );
  });

  it("allows automation only after payment is complete", () => {
    expect(isPracticeQAutomationReady(paidOrder)).toBe(true);
    expect(isPracticeQAutomationReady({ ...paidOrder, paymentStatus: "pending" })).toBe(false);
    expect(isPracticeQAutomationReady({ ...paidOrder, paymentStatus: "failed" })).toBe(false);
  });

  it("creates a queued job without storing questionnaire answers or identity media in the job payload", () => {
    const job = createPracticeQAutomationJob(paidOrder, patient);

    expect(job).toMatchObject({
      orderId: paidOrder.id,
      patientId: patient.id,
      status: "queued",
      attempts: 0,
      practiceQStartUrl: "https://intakeq.com/new/yjvht0?Name=Bishoy+Kamel&Email=thebishoy98%40gmail.com",
    });
    expect(job.handoffToken).toBeTruthy();
    expect(job.handoffExpiresAt).toBeTruthy();
    expect(JSON.stringify(job)).not.toContain("dateOfBirth");
    expect(JSON.stringify(job)).not.toContain("questionnaire");
    expect(JSON.stringify(job)).not.toContain("base64");
  });

  it("refuses to create an automation job before payment", () => {
    expect(() => createPracticeQAutomationJob({ ...paidOrder, paymentStatus: "pending" }, patient)).toThrow(
      "PracticeQ automation can only be queued after payment is completed"
    );
  });
});
