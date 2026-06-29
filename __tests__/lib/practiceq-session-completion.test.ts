import type { Order, Patient, Product } from "@/types";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import * as dbServer from "@/lib/db.server";
import * as pharmacy from "@/services/pharmacy";
import * as practiceq from "@/services/practiceq";
import { sendOrderSentToPharmacyMessage } from "@/services/order-notifications";

jest.mock("@/lib/db.server", () => ({
  practiceqAutomationJobDb: { update: jest.fn() },
  orderDb: { getById: jest.fn(), update: jest.fn() },
  patientDb: { getById: jest.fn() },
  productDb: { getById: jest.fn() },
  questionDb: { getAll: jest.fn() },
  answerDb: { getByOrder: jest.fn(), deleteByOrder: jest.fn() },
  consentDb: { getByOrder: jest.fn(), deleteByOrder: jest.fn() },
  uploadDb: { getByOrder: jest.fn(), purgeBase64ByOrder: jest.fn() },
  pharmacyOrderDb: { getByOrder: jest.fn(), create: jest.fn() },
  practiceqPacketDb: { getByOrder: jest.fn(), create: jest.fn(), update: jest.fn() },
  integrationLogDb: { create: jest.fn() },
}));

jest.mock("@/services/pharmacy", () => ({
  createPharmacyOrder: jest.fn(),
  getPharmacyProvider: jest.fn(() => "appsheet"),
}));

jest.mock("@/services/order-notifications", () => ({
  sendOrderSentToPharmacyMessage: jest.fn(),
}));

jest.mock("@/services/practiceq", () => ({
  getIntakeSummaryFeed: jest.fn(),
  uploadMissionChartFiles: jest.fn(),
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
    (dbServer.questionDb.getAll as jest.Mock).mockResolvedValue([]);
    (dbServer.answerDb.getByOrder as jest.Mock).mockResolvedValue([
      {
        id: "answer_1",
        orderId: order.id,
        questionId: "selected_dose",
        answer: "2.5mg weekly",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    (dbServer.consentDb.getByOrder as jest.Mock).mockResolvedValue(null);
    (dbServer.answerDb.deleteByOrder as jest.Mock).mockResolvedValue(1);
    (dbServer.consentDb.deleteByOrder as jest.Mock).mockResolvedValue(1);
    (dbServer.uploadDb.getByOrder as jest.Mock).mockResolvedValue([]);
    (dbServer.uploadDb.purgeBase64ByOrder as jest.Mock).mockResolvedValue(0);
    (dbServer.pharmacyOrderDb.getByOrder as jest.Mock).mockResolvedValue(null);
    (dbServer.pharmacyOrderDb.create as jest.Mock).mockResolvedValue(null);
    (dbServer.integrationLogDb.create as jest.Mock).mockResolvedValue(null);
    (dbServer.practiceqPacketDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "packet_1",
      orderId: order.id,
      patientId: patient.id,
      status: "submitted",
      submittedAt: "2026-01-01T00:00:00.000Z",
      packetData: {
        patientInfo: { id: patient.id },
        questionnaireAnswers: [],
        consentRecord: {},
        uploads: [],
        productRequested: product.name,
        doseSelected: "2.5mg weekly",
      },
    });
    (dbServer.practiceqPacketDb.update as jest.Mock).mockResolvedValue(null);
    (sendOrderSentToPharmacyMessage as jest.Mock).mockResolvedValue({ id: "sms_1" });
    (practiceq.getIntakeSummaryFeed as jest.Mock).mockResolvedValue({
      available: true,
      completed: [],
      pending: [],
      all: [],
    });
    (practiceq.uploadMissionChartFiles as jest.Mock).mockResolvedValue({
      answerFile: { fileId: "file_answers", filename: "answers.json", uploadedAt: "2026-01-01T00:00:00.000Z" },
      pdfFile: { fileId: "file_pdf", filename: "chart.pdf", uploadedAt: "2026-01-01T00:00:00.000Z" },
      identityFiles: [],
    });
    (pharmacy.getPharmacyProvider as jest.Mock).mockReturnValue("lifefile");
    (pharmacy.createPharmacyOrder as jest.Mock).mockResolvedValue({
      id: "pharmacy_1",
      orderId: order.id,
      patientId: patient.id,
      lifeFileOrderId: "124172582",
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

  it("attaches Mission chart files to the linked PracticeQ client", async () => {
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

    expect(practiceq.uploadMissionChartFiles).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client_81",
      order: expect.objectContaining({ id: order.id }),
      patient,
    }));
    expect(dbServer.practiceqPacketDb.update).toHaveBeenCalledWith("packet_1", expect.objectContaining({
      packetData: expect.objectContaining({
        questionnaireAnswers: [],
        consentRecord: {},
        practiceQAnswerFile: expect.objectContaining({ fileId: "file_answers" }),
        practiceQPdfFile: expect.objectContaining({ fileId: "file_pdf" }),
      }),
      status: "completed",
    }));
  });

  it("purges local answers, consent, and staged media after PracticeQ files are attached", async () => {
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

    expect(dbServer.answerDb.deleteByOrder).toHaveBeenCalledWith(order.id);
    expect(dbServer.consentDb.deleteByOrder).toHaveBeenCalledWith(order.id);
    expect(dbServer.uploadDb.purgeBase64ByOrder).toHaveBeenCalledWith(order.id);
    expect(dbServer.integrationLogDb.create).toHaveBeenCalledWith(expect.objectContaining({
      integrationName: "practiceq",
      action: "Local chart PHI purged after PracticeQ attachment",
      orderId: order.id,
      patientId: patient.id,
      status: "success",
      details: expect.objectContaining({
        answersDeleted: 1,
        consentDeleted: 1,
        mediaBytesPurged: 0,
      }),
    }));
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
    expect(dbServer.integrationLogDb.create).toHaveBeenCalledWith(expect.objectContaining({
      integrationName: "lifefile",
      action: "Pharmacy order submitted to LifeFile",
      orderId: order.id,
      patientId: patient.id,
      status: "success",
      details: expect.objectContaining({ lifeFileOrderId: "124172582" }),
    }));
    expect(sendOrderSentToPharmacyMessage).toHaveBeenCalledWith(patient, order.id);
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
    expect(sendOrderSentToPharmacyMessage).not.toHaveBeenCalled();
  });
});
