import * as practiceq from "@/services/practiceq";
import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import type { Order, Patient, Product } from "@/types";

const makePatient = (): Patient => ({
  id: "p1",
  firstName: "Bob",
  lastName: "Jones",
  dateOfBirth: "1985-06-15",
  gender: "male",
  phone: "5559876543",
  email: "bob@example.com",
  address: { street1: "456 Oak St", city: "Dallas", state: "TX", zipCode: "75201", country: "US" },
  shippingAddress: { street1: "456 Oak St", city: "Dallas", state: "TX", zipCode: "75201", country: "US" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeProduct = (): Product => ({
  id: "prod_1",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "GLP-1/GIP Receptor Agonist",
  startingPrice: 299,
  image: "/product-tirzepatide.svg",
  doses: [{ id: "dose_1", label: "2.5mg Starter", strength: "2.5mg", quantity: 1, price: 299 }],
  eligibilityNote: "BMI ≥ 27",
  isActive: true,
  createdAt: new Date().toISOString(),
});

const makeOrder = (): Order => ({
  id: "o1",
  patientId: "p1",
  productId: "prod_1",
  doseId: "dose_1",
  status: "draft",
  paymentStatus: "pending",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("practiceq.submitIntakePacket", () => {
  beforeEach(() => {
    db.patientDb.create(makePatient());
    db.productDb.create(makeProduct());
    db.orderDb.create(makeOrder());
  });

  it("creates a PracticeQ packet for valid order", async () => {
    const order = db.orderDb.getById("o1")!;
    const packet = await practiceq.submitIntakePacket(order);

    expect(packet.orderId).toBe("o1");
    expect(packet.patientId).toBe("p1");
    expect(packet.status).toBe("submitted");
    expect(packet.packetData.productRequested).toBe("Tirzepatide");
    expect(packet.packetData.doseSelected).toBe("2.5mg Starter");
  });

  it("saves packet to practiceqDb", async () => {
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    expect(db.practiceqDb.getByOrder("o1")).not.toBeNull();
  });

  it("creates an integration log entry", async () => {
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    const logs = db.integrationLogDb.getAll();
    const pqLog = logs.find((l) => l.integrationName === "practiceq");
    expect(pqLog).toBeDefined();
    expect(pqLog?.status).toBe("success");
    expect(pqLog?.orderId).toBe("o1");
  });

  it("throws when patient not found", async () => {
    const badOrder = { ...makeOrder(), patientId: "nonexistent" };
    await expect(practiceq.submitIntakePacket(badOrder)).rejects.toThrow("Patient or product not found");
  });

  it("throws when product not found", async () => {
    const badOrder = { ...makeOrder(), productId: "nonexistent" };
    await expect(practiceq.submitIntakePacket(badOrder)).rejects.toThrow("Patient or product not found");
  });
});

describe("practiceq.getPacketStatus", () => {
  it("returns not_found for unknown order", () => {
    const result = practiceq.getPacketStatus("nonexistent");
    expect(result.status).toBe("not_found");
    expect(result.errors).toBeDefined();
  });

  it("returns submitted status after packet creation", async () => {
    db.patientDb.create(makePatient());
    db.productDb.create(makeProduct());
    db.orderDb.create(makeOrder());
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    const result = practiceq.getPacketStatus("o1");
    expect(result.status).toBe("submitted");
  });
});

describe("practiceq live mirror helpers", () => {
  const originalFetch = global.fetch;
  const originalConfig = { ...serviceConfig.practiceq };

  afterEach(() => {
    global.fetch = originalFetch;
    Object.assign(serviceConfig.practiceq, originalConfig);
    jest.restoreAllMocks();
  });

  it("fetches a full intake by id with PracticeQ authentication", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ Id: "intake_123", Status: "Completed" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const intake = await practiceq.getIntakeById("intake_123");

    expect(fetchMock).toHaveBeenCalledWith("https://intakeq.com/api/v1/intakes/intake_123", {
      headers: {
        "X-Auth-Key": "test-api-key",
        "Content-Type": "application/json",
      },
    });
    expect(intake).toMatchObject({ Id: "intake_123", Status: "Completed" });
  });

  it("returns unavailable mirror data when PracticeQ API key is missing", async () => {
    serviceConfig.practiceq.apiKey = "";
    const order = { ...makeOrder(), practiceqClientId: "12345" };

    const mirror = await practiceq.getPracticeQMirrorForOrder(order);

    expect(mirror.available).toBe(false);
    expect(mirror.reason).toBe("PRACTICEQ_API_KEY is not configured");
    expect(mirror.clientId).toBe("12345");
  });

  it("normalizes PracticeQ client and intake answers for an order", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const order = { ...makeOrder(), practiceqClientId: "12345" };
    const packet = {
      id: "intake_123",
      orderId: order.id,
      patientId: order.patientId,
      submittedAt: "2026-05-26T10:00:00.000Z",
      status: "submitted" as const,
      packetData: {
        patientInfo: {},
        questionnaireAnswers: [],
        consentRecord: {},
        uploads: [],
        productRequested: "Tirzepatide",
        doseSelected: "2.5mg Starter",
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ClientId: 12345, Name: "Bob Jones", Email: "bob@example.com" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            Id: "intake_123",
            ClientId: 12345,
            Status: "Completed",
            QuestionnaireName: "Medical: Brief Intake Form",
            DateSubmitted: 1779793200000,
            Questions: [
              { Text: "Current weight", Answer: "210" },
              { QuestionText: "Medication allergies", Value: "None" },
            ],
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mirror = await practiceq.getPracticeQMirrorForOrder(order, packet);

    expect(mirror).toMatchObject({
      available: true,
      clientId: "12345",
      intakeId: "intake_123",
      status: "Completed",
      questionnaireName: "Medical: Brief Intake Form",
    });
    expect(mirror.answers).toEqual([
      { question: "Current weight", answer: "210" },
      { question: "Medication allergies", answer: "None" },
    ]);
  });
});
