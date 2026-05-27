/** @jest-environment node */

import { GET } from "@/app/api/practiceq/forms/route";
import { getIntakeSummaryFeed } from "@/services/practiceq";

jest.mock("@/services/practiceq", () => ({
  getIntakeSummaryFeed: jest.fn(),
}));

describe("GET /api/practiceq/forms", () => {
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

  it("returns the live PracticeQ intake summary feed", async () => {
    (getIntakeSummaryFeed as jest.Mock).mockResolvedValue({
      available: true,
      completed: [
        {
          id: "completed_1",
          clientName: "Completed Patient",
          status: "Completed",
          practiceQUrl: "https://intakeq.com/#/history/completed_1",
        },
      ],
      pending: [],
      all: [],
    });

    const response = await GET(new Request("https://mission.test/api/practiceq/forms?page=2&client=smith", {
      headers: { "x-provider-secret": "test-provider-secret" },
    }));
    const body = await response.json();

    expect(getIntakeSummaryFeed).toHaveBeenCalledWith({
      page: 2,
      client: "smith",
      startDate: undefined,
      endDate: undefined,
      updatedSince: undefined,
    });
    expect(response.status).toBe(200);
    expect(body.completed).toHaveLength(1);
    expect(body.completed[0]).not.toHaveProperty("apiKey");
  });

  it("rejects requests without provider or admin authorization", async () => {
    const response = await GET(new Request("https://mission.test/api/practiceq/forms"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Provider authorization required");
    expect(getIntakeSummaryFeed).not.toHaveBeenCalled();
  });
});
