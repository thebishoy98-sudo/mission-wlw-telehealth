import type { Order, Patient, Product } from "@/types";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import * as dbServer from "@/lib/db.server";
import * as pharmacy from "@/services/pharmacy";
import * as spruceServer from "@/services/spruce.server";
import * as practiceq from "@/services/practiceq";

jest.mock("@/lib/db.server", () => ({
  practiceqAutomationJobDb: { update: jest.fn() },
  orderDb: { getById: jest.fn(), update: jest.fn() },
  patientDb: { getById: jest.fn() },
  productDb: { getById: jest.fn() },
  answerDb: { getByOrder: jest.fn() },
  pharmacyOrderDb: { getByOrder: jest.fn(), create: jest.fn() },
}));

jest.mock("@/services/pharmacy", () => ({
  createPharmacyOrder: jest.fn(),
  getPharmacyProvider: jest.fn(() => "appsheet"),
}));

jest.mock("@/services/spruce.server", () => ({
  sendMessage: jest.fn(),
}));

jest.mock("@/services/practiceq", () => ({
  getIntakeSummaryFeed: jest.fn(),
}));

jest.mock("@/lib/phi-audit", () => ({
  logPhiDisclosure: jest.fn(),
}));

const product: Product = {
  id: "product_tirzepatide",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "",
  startingPrice: 349,
  image: "",
  eligibilityNote: "",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  doses: [
    {
      id: "tirzepatide_20mg_8_week",
      label: "Tirzepatide 20mg",
      strength: "20mg vial",
      quantity: 1,
      price: 349,
      weeklyDoseMg: 2.5,
      patientDescription: "2.5mg weekly",
    },
  ],
};

const patient: Patient = {
  id: "patient_1",
  firstName: "Bishoy",
  lastName: "Kamel",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "patient@example.com",
  address: { street1: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  shippingAddress: { street1: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const order: Order = {
  id: "order_1",
  patientId: patient.id,
  productId: product.id,
  doseId: "browser_generated_dose",
  status: "approved",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "invoiced",
  identityStatus: "verified",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("completePracticeQSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (dbServer.practiceqAutomationJobDb.update as jest.Mock).mockResolvedValue({
      id: "job_1",
      orderId: order.id,
    });
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue(order);
    (dbServer.orderDb.update as jest.Mock).mockImplementation(async (_id, data) => ({ ...order, ...data }));
    (dbServer.patientDb.getById as jest.Mock).mockResolvedValue(patient);
    (dbServer.productDb.getById as jest.Mock).mockResolvedValue(product);
    (dbServer.answerDb.getByOrder as jest.Mock).mockResolvedValue([
      {
        id: "answer_1",
        orderId: order.id,
        questionId: "selected_dose",
        answer: "2.5mg weekly",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    (dbServer.pharmacyOrderDb.getByOrder as jest.Mock).mockResolvedValue(null);
    (dbServer.pharmacyOrderDb.create as jest.Mock).mockResolvedValue(null);
    (spruceServer.sendMessage as jest.Mock).mockResolvedValue({ id: "sms_1" });
    (practiceq.getIntakeSummaryFeed as jest.Mock).mockResolvedValue({
      available: true,
      completed: [],
      pending: [],
      all: [],
    });
    (pharmacy.createPharmacyOrder as jest.Mock).mockResolvedValue({
      id: "pharmacy_1",
      orderId: order.id,
      patientId: patient.id,
      status: "submitted",
      payload: {},
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("links the completed hosted PracticeQ intake back to the Mission order", async () => {
    (practiceq.getIntakeSummaryFeed as jest.Mock).mockResolvedValue({
      available: true,
      completed: [],
      pending: [],
      all: [
        {
          id: "intake_1",
          clientId: "client_81",
          clientEmail: patient.email,
          clientName: "Bishoy Kamel",
          status: "Completed",
          submittedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await completePracticeQSession("job_1");

    expect(dbServer.practiceqAutomationJobDb.update).toHaveBeenCalledWith("job_1", {
      intakeId: "intake_1",
    });
    expect(dbServer.orderDb.update).toHaveBeenCalledWith(order.id, {
      practiceqClientId: "client_81",
      practiceQStatus: "completed",
    });
  });

  it("marks the order PracticeQ-completed and dispatches verified orders to pharmacy", async () => {
    const result = await completePracticeQSession("job_1");

    expect(result).toEqual({ status: "sent_to_pharmacy", pharmacyOrderId: "pharmacy_1" });
    expect(dbServer.practiceqAutomationJobDb.update).toHaveBeenCalledWith("job_1", { status: "completed" });
    expect(dbServer.orderDb.update).toHaveBeenCalledWith(order.id, { practiceQStatus: "completed" });
    expect(pharmacy.createPharmacyOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: order.id, doseId: "tirzepatide_20mg_8_week" }),
      { patient, product }
    );
    expect(dbServer.orderDb.update).toHaveBeenCalledWith(order.id, {
      status: "sent_to_pharmacy",
      pharmacyStatus: "submitted",
    });
    expect(spruceServer.sendMessage).toHaveBeenCalledWith(patient, "order_sent_to_pharmacy", { orderId: order.id });
  });

  it("waits for admin identity review before pharmacy dispatch", async () => {
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue({ ...order, identityStatus: "needs_review" });
    (dbServer.orderDb.update as jest.Mock).mockImplementation(async (_id, data) => ({
      ...order,
      identityStatus: "needs_review",
      ...data,
    }));

    await expect(completePracticeQSession("job_1")).resolves.toEqual({ status: "waiting_for_identity" });
    expect(pharmacy.createPharmacyOrder).not.toHaveBeenCalled();
    expect(spruceServer.sendMessage).not.toHaveBeenCalled();
  });
});
