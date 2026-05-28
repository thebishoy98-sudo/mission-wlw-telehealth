import { hydratePatientFromPracticeQ, loadProviderPatientChart } from "@/lib/provider-chart";
import type { Order, Patient, Product, ProviderReview } from "@/types";

const patient: Patient = {
  id: "patient_server",
  firstName: "Allen",
  lastName: "S",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "alentest@gmail.com",
  address: { street1: "5319 Davisson a", city: "orlando", state: "fl", zipCode: "32810", country: "USA" },
  shippingAddress: { street1: "5319 Davisson a", city: "orlando", state: "fl", zipCode: "32810", country: "USA" },
  createdAt: "2026-05-23T18:54:00.000Z",
  updatedAt: "2026-05-23T18:54:00.000Z",
};

const order: Order = {
  id: "order_server",
  patientId: patient.id,
  productId: "product_tirzepatide",
  doseId: "dose_25",
  status: "pending_review",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "submitted",
  quickbooksStatus: "invoiced",
  identityStatus: "missing",
  createdAt: "2026-05-23T18:54:00.000Z",
  updatedAt: "2026-05-23T18:54:00.000Z",
};

const product: Product = {
  id: "product_tirzepatide",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "GLP-1",
  startingPrice: 299,
  image: "",
  doses: [{ id: "dose_25", label: "2.5mg Weekly", strength: "2.5mg", quantity: 4, price: 299 }],
  eligibilityNote: "",
  isActive: true,
  createdAt: "2026-05-23T18:54:00.000Z",
};

const review: ProviderReview = {
  id: "review_server",
  orderId: order.id,
  patientId: patient.id,
  status: "needs_more_info",
  identityReviewRequired: true,
};

describe("loadProviderPatientChart", () => {
  it("loads a provider chart from server stores by patient id", async () => {
    const chart = await loadProviderPatientChart(patient.id, {
      patients: { getById: jest.fn().mockResolvedValue(patient) },
      orders: { getByPatient: jest.fn().mockResolvedValue([order]) },
      products: { getById: jest.fn().mockResolvedValue(product) },
      questions: { getAll: jest.fn().mockResolvedValue([]) },
      answers: { getByOrder: jest.fn().mockResolvedValue([]) },
      consents: { getByOrder: jest.fn().mockResolvedValue(null) },
      uploads: { getByOrder: jest.fn().mockResolvedValue([]) },
      payments: { getByOrder: jest.fn().mockResolvedValue({ amount: 299 }) },
      reviews: { getByOrder: jest.fn().mockResolvedValue(review) },
    });

    expect(chart?.patient).toMatchObject({ id: patient.id, firstName: "Allen", lastName: "S" });
    expect(chart?.orders).toHaveLength(1);
    expect(chart?.selectedOrder.id).toBe(order.id);
    expect(chart?.product?.id).toBe(product.id);
    expect(chart?.payment).toMatchObject({ amount: 299 });
    expect(chart?.review?.identityReviewRequired).toBe(true);
  });

  it("returns null when the patient is not in the server store", async () => {
    const chart = await loadProviderPatientChart("missing", {
      patients: { getById: jest.fn().mockResolvedValue(null) },
      orders: { getByPatient: jest.fn() },
      products: { getById: jest.fn() },
      questions: { getAll: jest.fn() },
      answers: { getByOrder: jest.fn() },
      consents: { getByOrder: jest.fn() },
      uploads: { getByOrder: jest.fn() },
      payments: { getByOrder: jest.fn() },
      reviews: { getByOrder: jest.fn() },
    });

    expect(chart).toBeNull();
  });
});

describe("hydratePatientFromPracticeQ", () => {
  it("fills incomplete provider/admin patient rows from PracticeQ answers", () => {
    const incompletePatient: Patient = {
      ...patient,
      firstName: "" as string,
      lastName: "" as string,
      email: "",
      phone: "",
      dateOfBirth: "",
      address: { street1: "", city: "", state: "", zipCode: "", country: "US" },
      shippingAddress: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    };

    const hydrated = hydratePatientFromPracticeQ(incompletePatient, {
      available: true,
      clientId: "81",
      clientEmail: "chart@example.com",
      intakeId: "intake-1",
      questionnaireName: "Medical: Brief Intake",
      submittedAt: "2026-05-27T00:00:00.000Z",
      practiceQUrl: "https://intakeq.com/#/history/intake-1",
      answers: [
        { question: "First Name", answer: "Bishoy" },
        { question: "Last Name", answer: "Kamel" },
        { question: "Date of Birth", answer: "4/14/1998" },
        { question: "Phone Number", answer: "7328228376" },
        { question: "Address (For Medication Shipment)", answer: "123 Main St" },
        { question: "City", answer: "Orlando" },
        { question: "State", answer: "FL" },
        { question: "Zip Code", answer: "32801" },
      ],
    });

    expect(hydrated).toMatchObject({
      firstName: "Bishoy",
      lastName: "Kamel",
      email: "chart@example.com",
      phone: "7328228376",
      dateOfBirth: "4/14/1998",
      address: {
        street1: "123 Main St",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
      },
    });
  });
});
