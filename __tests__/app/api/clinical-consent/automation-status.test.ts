import * as dbServer from "@/lib/db.server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      ({
        status: init?.status ?? 200,
        json: async () => body,
      }),
  },
}));

jest.mock("@/lib/db.server", () => ({
  orderDb: {
    getById: jest.fn(),
  },
  practiceqAutomationJobDb: {
    getByOrder: jest.fn(),
  },
}));

const { GET } = require("@/app/api/clinical-consent/automation/[orderId]/route");

function request(patientId: string) {
  return {
    url: `https://mission.test/api/clinical-consent/automation/order_1?patientId=${patientId}`,
    headers: new Map(),
  } as unknown as Request;
}

describe("GET /api/clinical-consent/automation/[orderId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns patient-safe PracticeQ automation status without provider auth when the patient matches the order", async () => {
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue({ id: "order_1", patientId: "patient_1" });
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "job_1",
      orderId: "order_1",
      patientId: "patient_1",
      status: "awaiting_patient_signature",
      attempts: 1,
      handoffUrl: "https://worker.example/session/job_1?token=secret_token",
      handoffToken: "secret_token",
      practiceQStartUrl: "https://intakeq.com/new/yjvht0?Name=Secret",
    });

    const response = await GET(request("patient_1"), {
      params: Promise.resolve({ orderId: "order_1" }),
    });

    const body = await response.json();
    expect(body).toEqual({
      available: true,
      status: "awaiting_patient_signature",
      handoffUrl: "https://worker.example/session/job_1?token=secret_token",
      lastError: undefined,
    });
    expect(JSON.stringify(body)).not.toContain("practiceQStartUrl");
    expect(body).not.toHaveProperty("handoffToken");
  });

  it("does not expose a PracticeQ handoff URL when the browser patient does not match the order", async () => {
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue({ id: "order_1", patientId: "patient_1" });
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "job_1",
      status: "awaiting_patient_signature",
      handoffUrl: "https://worker.example/session/job_1?token=secret_token",
    });

    const response = await GET(request("wrong_patient"), {
      params: Promise.resolve({ orderId: "order_1" }),
    });

    await expect(response.json()).resolves.toEqual({ available: false });
  });

  it("reports retryable failed jobs as still preparing instead of showing a terminal patient failure", async () => {
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue({ id: "order_1", patientId: "patient_1" });
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "job_1",
      status: "failed",
      attempts: 3,
      intakeId: undefined,
      lastError: "temporary PracticeQ automation failure",
    });

    const response = await GET(request("patient_1"), {
      params: Promise.resolve({ orderId: "order_1" }),
    });

    await expect(response.json()).resolves.toEqual({
      available: true,
      status: "running",
      handoffUrl: undefined,
      lastError: undefined,
    });
  });
});
