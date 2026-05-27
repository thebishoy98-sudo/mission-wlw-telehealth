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
    expect(packet.packetData.questionnaireAnswers).toEqual([]);
    expect(packet.packetData.patientInfo).toEqual({ id: "p1" });
    expect(packet.packetData.uploads).toEqual([]);
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

  it("posts Mission answers back into the sent PracticeQ intake", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    serviceConfig.practiceq.questionnaireId = "questionnaire_1";
    serviceConfig.practiceq.intakeEndpoint = "https://intakeq.com/api/v1/intakes/send";
    serviceConfig.practiceq.useMock = false;

    const patient = makePatient();
    const product = makeProduct();
    const order = makeOrder();
    const questions = [
      { id: "pq_height", text: "What is your height?", type: "text" as const, category: "screening" as const, required: true, displayOrder: 1 },
      { id: "pq_current_weight", text: "What is your current body weight?", type: "text" as const, category: "screening" as const, required: true, displayOrder: 2 },
    ];
    const answers = [
      { id: "answer_1", orderId: order.id, questionId: "pq_height", answer: "5 ft 6 in", createdAt: new Date().toISOString() },
      { id: "answer_2", orderId: order.id, questionId: "pq_current_weight", answer: "212", createdAt: new Date().toISOString() },
    ];
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ClientId: 12345 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          Id: "intake_123",
          ClientId: 12345,
          Status: "Sent",
          Questions: [
            { Text: "First Name", Answer: "" },
            { Text: "What is your height?", Answer: "" },
            { Text: "What is your current body weight?", Answer: "" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ Id: "intake_123", Status: "Partial" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ FileId: "file_answers_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ FileId: "file_pdf_1" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await practiceq.submitIntakePacket(order, { patient, product, questions, answers });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://intakeq.com/api/v1/intakes",
      expect.objectContaining({ method: "POST" })
    );
    const updateBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(updateBody.Questions).toEqual([
      expect.objectContaining({ Text: "First Name", Answer: "Bob" }),
      expect.objectContaining({ Text: "What is your height?", Answer: "5 ft 6 in" }),
      expect.objectContaining({ Text: "What is your current body weight?", Answer: "212" }),
    ]);
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

  it("recovers a missing packet by finding a live PracticeQ intake for the order", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const order = { ...makeOrder(), practiceqClientId: "12345" };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ClientId: 12345, Name: "Bob Jones", Email: "bob@example.com" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              Id: "intake_recovered",
              ClientId: 12345,
              Status: "Partial",
              QuestionnaireName: "Medical: Brief Intake Form",
              ExternalClientId: order.id,
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            Id: "intake_recovered",
            ClientId: 12345,
            Status: "Partial",
            QuestionnaireName: "Medical: Brief Intake Form",
            Questions: [
              { Text: "First Name", Answer: "Bob" },
              { Text: "Current weight", Answer: "210" },
            ],
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mirror = await practiceq.getPracticeQMirrorForOrder(order);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://intakeq.com/api/v1/intakes/summary?all=true&page=1&client=12345",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Key": "test-api-key" }),
      })
    );
    expect(mirror).toMatchObject({
      available: true,
      clientId: "12345",
      intakeId: "intake_recovered",
      status: "Partial",
      questionnaireName: "Medical: Brief Intake Form",
    });
    expect(mirror.answers).toEqual([
      { question: "First Name", answer: "Bob" },
      { question: "Current weight", answer: "210" },
    ]);
  });

  it("replaces an errored empty packet with a matching live PracticeQ intake", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const order = { ...makeOrder(), practiceqClientId: "12345" };
    const packet = {
      id: "bad_packet_id",
      orderId: order.id,
      patientId: order.patientId,
      submittedAt: "2026-05-26T10:00:00.000Z",
      status: "error" as const,
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
            Id: "bad_packet_id",
            ClientId: 12345,
            Status: "Error",
            QuestionnaireName: "PracticeQ form",
            Questions: [],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              Id: "intake_recovered",
              ClientId: 12345,
              Status: "Partial",
              QuestionnaireName: "Medical: Brief Intake Form",
              ExternalClientId: order.id,
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            Id: "intake_recovered",
            ClientId: 12345,
            Status: "Partial",
            QuestionnaireName: "Medical: Brief Intake Form",
            Questions: [{ Text: "Current weight", Answer: "210" }],
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mirror = await practiceq.getPracticeQMirrorForOrder(order, packet);

    expect(mirror.intakeId).toBe("intake_recovered");
    expect(mirror.status).toBe("Partial");
    expect(mirror.answers).toEqual([{ question: "Current weight", answer: "210" }]);
  });

  it("falls back to the unfiltered PracticeQ feed when client summary search has no match", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const order = { ...makeOrder(), practiceqClientId: "12345" };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ClientId: 12345, Name: "Bob Jones", Email: "bob@example.com" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              Id: "intake_unfiltered",
              ClientId: 12345,
              Status: "Partial",
              QuestionnaireName: "Medical: Brief Intake Form",
              ExternalClientId: order.id,
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            Id: "intake_unfiltered",
            ClientId: 12345,
            Status: "Partial",
            Questions: [{ Text: "Current weight", Answer: "211" }],
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mirror = await practiceq.getPracticeQMirrorForOrder(order);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://intakeq.com/api/v1/intakes/summary?all=true&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Key": "test-api-key" }),
      })
    );
    expect(mirror.intakeId).toBe("intake_unfiltered");
    expect(mirror.answers).toEqual([{ question: "Current weight", answer: "211" }]);
  });
});

describe("practiceq intake summary feed", () => {
  const originalConfig = { ...serviceConfig.practiceq };

  afterEach(() => {
    Object.assign(serviceConfig.practiceq, originalConfig);
    jest.restoreAllMocks();
  });

  it("queries PracticeQ intake summaries with all statuses and normalizes dashboard rows", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([
        {
          Id: "completed_1",
          ClientName: "Completed Patient",
          ClientEmail: "done@example.com",
          ClientId: 123,
          Status: "Completed",
          DateCreated: 1700000000000,
          DateSubmitted: 1700000600000,
          QuestionnaireName: "Medical: Brief Intake",
          QuestionnaireId: "questionnaire_1",
          PractitionerName: "Provider One",
          ExternalClientId: "order_1",
        },
        {
          Id: "pending_1",
          ClientName: "Pending Patient",
          ClientId: 456,
          Status: "Partial",
          DateCreated: 1700001000000,
          QuestionnaireName: "Medical: Brief Intake",
        },
      ]),
      json: async () => [],
    } as Response);
    global.fetch = fetchMock;

    const feed = await practiceq.getIntakeSummaryFeed();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://intakeq.com/api/v1/intakes/summary?all=true&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Key": "test-api-key" }),
      })
    );
    expect(feed.completed).toEqual([
      expect.objectContaining({
        id: "completed_1",
        clientName: "Completed Patient",
        clientId: "123",
        status: "Completed",
        questionnaireName: "Medical: Brief Intake",
        submittedAt: "2023-11-14T22:23:20.000Z",
        practiceQUrl: "https://intakeq.com/#/history/completed_1",
      }),
    ]);
    expect(feed.pending).toEqual([
      expect.objectContaining({
        id: "pending_1",
        clientName: "Pending Patient",
        clientId: "456",
        status: "Partial",
        createdAt: "2023-11-14T22:30:00.000Z",
      }),
    ]);
  });

  it("returns an unavailable feed when the PracticeQ API key is missing", async () => {
    serviceConfig.practiceq.apiKey = "";

    const feed = await practiceq.getIntakeSummaryFeed();

    expect(feed.available).toBe(false);
    expect(feed.reason).toBe("PRACTICEQ_API_KEY is not configured");
    expect(feed.completed).toEqual([]);
    expect(feed.pending).toEqual([]);
  });
});

describe("practiceq full form detail", () => {
  const originalConfig = { ...serviceConfig.practiceq };

  afterEach(() => {
    Object.assign(serviceConfig.practiceq, originalConfig);
    jest.restoreAllMocks();
  });

  it("loads a full PracticeQ intake with normalized answers", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        Id: "intake_1",
        ClientName: "Chart Patient",
        ClientEmail: "chart@example.com",
        ClientId: 789,
        Status: "Completed",
        DateCreated: 1700000000000,
        DateSubmitted: 1700000600000,
        QuestionnaireName: "Medical: Brief Intake",
        Questions: [
          { Text: "Current medications", Answer: "None", QuestionType: "OpenQuestion" },
          {
            Text: "Health concerns",
            QuestionType: "Matrix",
            ColumnNames: ["Concern", "Date"],
            Rows: [{ Text: "1", Answers: ["Weight", "2024"] }],
          },
        ],
      }),
      json: async () => ({}),
    } as Response);
    global.fetch = fetchMock;

    const detail = await practiceq.getPracticeQFormDetail("intake_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://intakeq.com/api/v1/intakes/intake_1",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Key": "test-api-key" }),
      })
    );
    expect(detail).toEqual(expect.objectContaining({
      available: true,
      intakeId: "intake_1",
      clientId: "789",
      clientName: "Chart Patient",
      questionnaireName: "Medical: Brief Intake",
    }));
    expect(detail.answers).toEqual([
      { question: "Current medications", answer: "None" },
      { question: "Health concerns", answer: "1: Weight, 2024" },
    ]);
  });
});

describe("practiceq files helpers", () => {
  const originalFetch = global.fetch;
  const originalConfig = { ...serviceConfig.practiceq };

  afterEach(() => {
    global.fetch = originalFetch;
    Object.assign(serviceConfig.practiceq, originalConfig);
    jest.restoreAllMocks();
  });

  it("uploads a client file to the PracticeQ Files API", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ Id: "file_123" }),
    } as Response);
    global.fetch = fetchMock;

    const file = await practiceq.uploadPracticeQClientFile("12345", {
      filename: "identity-document.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("hello"),
    });

    expect(file.id).toBe("file_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://intakeq.com/api/v1/files/12345",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Auth-Key": "test-api-key" },
      })
    );
  });

  it("accepts nested PracticeQ file ids from envelope responses", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ type: "success", data: { fileId: "file_nested" } }),
    } as Response);
    global.fetch = fetchMock;

    const file = await practiceq.uploadPracticeQClientFile("12345", {
      filename: "identity-document.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("hello"),
    });

    expect(file.id).toBe("file_nested");
  });

  it("falls back to the client file list when upload returns no file id", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ type: "success", message: "uploaded" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([{ Id: "file_from_list", Name: "identity-document.jpg" }]),
      } as Response);
    global.fetch = fetchMock;

    const file = await practiceq.uploadPracticeQClientFile("12345", {
      filename: "identity-document.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("hello"),
    });

    expect(file.id).toBe("file_from_list");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://intakeq.com/api/v1/files?clientId=12345", {
      headers: { "X-Auth-Key": "test-api-key" },
    });
  });

  it("downloads a client file from the PracticeQ Files API", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
    const bytes = Buffer.from("hello");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "video/webm" }),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as Response);
    global.fetch = fetchMock;

    const file = await practiceq.downloadPracticeQFile("file_123");

    expect(file.contentType).toBe("video/webm");
    expect(file.body.toString("utf8")).toBe("hello");
    expect(fetchMock).toHaveBeenCalledWith("https://intakeq.com/api/v1/files/file_123", {
      headers: { "X-Auth-Key": "test-api-key" },
    });
  });
});
