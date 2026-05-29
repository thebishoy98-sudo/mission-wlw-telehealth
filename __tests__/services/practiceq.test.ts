import * as practiceq from "@/services/practiceq";
import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import type { Order, Patient, Product, Question, QuestionnaireAnswer } from "@/types";

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

describe("PracticeQ answer mapping contract", () => {
  const patient = makePatient();
  const questions: Question[] = [
    {
      id: "pq_height",
      category: "medical",
      text: "What is your height?",
      type: "text",
      required: true,
      displayOrder: 1,
    },
    {
      id: "local_weight",
      category: "medical",
      text: "What is your current body weight?",
      type: "text",
      required: true,
      displayOrder: 2,
    },
  ];
  const answers: QuestionnaireAnswer[] = [
    {
      id: "a_height",
      orderId: "o1",
      questionId: "pq_height",
      answer: "5 ft 11 in",
      createdAt: "2026-05-27T00:00:00.000Z",
    },
    {
      id: "a_weight",
      orderId: "o1",
      questionId: "local_weight",
      answer: "215",
      createdAt: "2026-05-27T00:00:00.000Z",
    },
  ];

  it("builds a structured answer packet with demographics and clinical answers", () => {
    const rows = practiceq.buildMissionIntakeAnswerRows(patient, answers, questions);

    expect(rows).toEqual(
      expect.arrayContaining([
        { question: "First Name", answer: "Bob" },
        { question: "Last Name", answer: "Jones" },
        { question: "Phone Number", answer: "5559876543" },
        { question: "What is your height?", answer: "5 ft 11 in" },
        { question: "What is your current body weight?", answer: "215" },
      ])
    );
  });

  it("fills PracticeQ intake questions by exact PracticeQ question id and by text fallback", () => {
    const intakeQuestions = [
      { Id: "pq_height", Text: "What is your height?", Answer: "" },
      { Id: "practiceq_weight", Text: "What is your current body weight?", Answer: "" },
      { Id: "practiceq_first", Text: "First Name", Answer: "" },
      { Id: "practiceq_email", Text: "Email", Answer: "" },
    ];

    const changed = practiceq.applyMissionAnswersToPracticeQQuestions(intakeQuestions, {
      patient,
      answers,
      questions,
    });

    expect(changed).toBe(true);
    expect(intakeQuestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Id: "pq_height", Answer: "5 ft 11 in" }),
        expect.objectContaining({ Id: "practiceq_weight", Answer: "215" }),
        expect.objectContaining({ Id: "practiceq_first", Answer: "Bob" }),
        expect.objectContaining({ Id: "practiceq_email", Answer: "bob@example.com" }),
      ])
    );
  });
});

describe("practiceq.markPracticeQIntakeCompletedViaApi", () => {
  const originalConfig = { ...serviceConfig.practiceq };
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.assign(serviceConfig.practiceq, {
      ...originalConfig,
      apiKey: "test-practiceq-key",
      baseUrl: "https://intakeq.test/api/v1",
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ Id: "intake_1", Status: "Completed" }),
    })) as jest.Mock;
  });

  afterEach(() => {
    Object.assign(serviceConfig.practiceq, originalConfig);
    global.fetch = originalFetch;
  });

  it("posts the full intake with Status Completed without requiring answer changes", async () => {
    const result = await practiceq.markPracticeQIntakeCompletedViaApi({
      Id: "intake_1",
      Status: "Submitted",
      Questions: [{ Id: "q1", Text: "First Name", Answer: "Bob" }],
    });

    expect(result?.Status).toBe("Completed");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://intakeq.test/api/v1/intakes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          Id: "intake_1",
          Status: "Completed",
          Questions: [{ Id: "q1", Text: "First Name", Answer: "Bob" }],
        }),
      })
    );
  });
});
