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
  practiceqAutomationJobDb: {
    getByOrder: jest.fn(),
  },
}));

jest.mock("@/lib/server-auth", () => ({
  requireProviderOrAdmin: jest.fn().mockReturnValue(null),
  requireProvider: jest.fn().mockReturnValue(null),
  requireAdmin: jest.fn().mockReturnValue(null),
}));

const { GET } = require("@/app/api/practiceq/automation/[orderId]/route");

describe("GET /api/practiceq/automation/[orderId]", () => {
  it("returns safe job status and handoff URL without exposing secret token", async () => {
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "job_1",
      orderId: "order_1",
      patientId: "patient_1",
      status: "awaiting_patient_signature",
      attempts: 1,
      practiceQStartUrl: "https://intakeq.com/new/yjvht0?Name=Secret",
      handoffToken: "secret_token",
      handoffExpiresAt: "2026-05-27T00:30:00.000Z",
      handoffUrl: "https://worker.example/session/job_1?token=secret_token",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:05:00.000Z",
    });

    const response = await GET({} as Request, {
      params: { orderId: "order_1" },
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

  it("returns unavailable when no job exists", async () => {
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue(null);

    const response = await GET({} as Request, {
      params: { orderId: "missing" },
    });

    await expect(response.json()).resolves.toEqual({ available: false });
  });
});
