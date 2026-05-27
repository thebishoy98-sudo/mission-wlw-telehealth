import { hydratePatientFromPracticeQ, loadProviderPatientChart } from "@/lib/provider-chart";
import type { Order, Patient, PracticeQMirror, Product, ProviderReview } from "@/types";

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
    const practiceq: PracticeQMirror = {
      available: true,
      clientId: "12345",
      intakeId: "intake_123",
      status: "Completed",
      questionnaireName: "Medical: Brief Intake Form",
      answers: [{ question: "What is your current body weight?", answer: "210" }],
    };
    const chart = await loadProviderPatientChart(patient.id, {
      patients: { getById: jest.fn().mockResolvedValue(patient) },
      orders: { getByPatient: jest.fn().mockResolvedValue([order]) },
      products: { getById: jest.fn().mockResolvedValue(product) },
      questions: { getAll: jest.fn().mockResolvedValue([{ id: "pq_current_weight", text: "What is your current body weight?" }]) },
      answers: { getByOrder: jest.fn().mockResolvedValue([]) },
      consents: { getByOrder: jest.fn().mockResolvedValue(null) },
      uploads: { getByOrder: jest.fn().mockResolvedValue([]) },
      payments: { getByOrder: jest.fn().mockResolvedValue({ amount: 299 }) },
      reviews: { getByOrder: jest.fn().mockResolvedValue(review) },
      practiceqPackets: { getByOrder: jest.fn().mockResolvedValue({ id: "intake_123" }) },
      practiceqMirror: { getForOrder: jest.fn().mockResolvedValue(practiceq) },
    });

    expect(chart?.patient).toMatchObject({ id: patient.id, firstName: "Allen", lastName: "S" });
    expect(chart?.orders).toHaveLength(1);
    expect(chart?.selectedOrder.id).toBe(order.id);
    expect(chart?.product?.id).toBe(product.id);
    expect(chart?.payment).toBeNull();
    expect(chart?.review?.identityReviewRequired).toBe(true);
    expect(chart?.practiceq).toMatchObject({
      available: true,
      clientId: "12345",
      intakeId: "intake_123",
      questionnaireName: "Medical: Brief Intake Form",
    });
    expect(chart?.practiceq?.answers).toContainEqual({
      question: "What is your current body weight?",
      answer: "210",
    });
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
  it("fills local patient stubs from linked PracticeQ intake answers", () => {
    const stub: Patient = {
      ...patient,
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      phone: "",
      email: "",
      address: { street1: "", city: "", state: "", zipCode: "", country: "US" },
      shippingAddress: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    };
    const practiceq: PracticeQMirror = {
      available: true,
      clientName: "Allen PracticeQ",
      clientEmail: "allen.practiceq@example.com",
      answers: [
        { question: "First Name", answer: "Allen" },
        { question: "Last Name", answer: "PracticeQ" },
        { question: "Date of Birth", answer: "6/15/1985" },
        { question: "Phone Number", answer: "5551234567" },
        { question: "Address (For Medication Shipment)", answer: "123 Test Street" },
        { question: "City", answer: "Dallas" },
        { question: "State", answer: "TX" },
        { question: "Zip Code", answer: "75201" },
      ],
    };

    expect(hydratePatientFromPracticeQ(stub, practiceq)).toMatchObject({
      firstName: "Allen",
      lastName: "PracticeQ",
      email: "allen.practiceq@example.com",
      phone: "5551234567",
      dateOfBirth: "6/15/1985",
      address: {
        street1: "123 Test Street",
        city: "Dallas",
        state: "TX",
        zipCode: "75201",
      },
    });
  });
});
