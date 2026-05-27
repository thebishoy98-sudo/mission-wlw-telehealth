/** @jest-environment node */

import { GET } from "@/app/api/practiceq/forms/[id]/route";
import { getPracticeQFormDetail } from "@/services/practiceq";

jest.mock("@/services/practiceq", () => ({
  getPracticeQFormDetail: jest.fn(),
}));

describe("GET /api/practiceq/forms/[id]", () => {
  const originalProviderSecret = process.env.PROVIDER_SECRET;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.PROVIDER_SECRET = "test-provider-secret";
    process.env.VERCEL_ENV = "production";
  });

  afterEach(() => {
    jest.resetAllMocks();
    process.env.PROVIDER_SECRET = originalProviderSecret;
    process.env.VERCEL_ENV = originalVercelEnv;
  });

  it("returns one full PracticeQ form detail", async () => {
    (getPracticeQFormDetail as jest.Mock).mockResolvedValue({
      available: true,
      intakeId: "intake_1",
      clientName: "Chart Patient",
      questionnaireName: "Medical: Brief Intake",
      answers: [{ question: "Medication", answer: "None" }],
    });

    const response = await GET(
      new Request("https://mission.test/api/practiceq/forms/intake_1", {
        headers: { "x-provider-secret": "test-provider-secret" },
      }),
      { params: { id: "intake_1" } }
    );
    const body = await response.json();

    expect(getPracticeQFormDetail).toHaveBeenCalledWith("intake_1");
    expect(response.status).toBe(200);
    expect(body.answers).toEqual([{ question: "Medication", answer: "None" }]);
  });

  it("rejects requests without provider or admin authorization", async () => {
    const response = await GET(new Request("https://mission.test/api/practiceq/forms/intake_1"), {
      params: { id: "intake_1" },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Provider authorization required");
    expect(getPracticeQFormDetail).not.toHaveBeenCalled();
  });
});
