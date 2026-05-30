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
  answerDb: {
    create: jest.fn(),
  },
  questionDb: {
    getAll: jest.fn(),
    upsert: jest.fn(),
  },
  practiceqAutomationJobDb: {
    getByOrder: jest.fn(),
    getFailedWithNoIntake: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("@/lib/db", () => ({
  questionDb: {
    getAll: jest.fn(() => []),
  },
}));

const { POST } = require("@/app/api/cron/requeue-pq-jobs/route");

function request(body: unknown, key = "test-key") {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "x-practiceq-api-key" ? key : null),
    },
    json: async () => body,
  } as any;
}

describe("POST /api/cron/requeue-pq-jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRACTICEQ_API_KEY = "test-key";
    (dbServer.answerDb.create as jest.Mock).mockResolvedValue({});
    (dbServer.questionDb.getAll as jest.Mock).mockResolvedValue([]);
    (dbServer.questionDb.upsert as jest.Mock).mockResolvedValue({});
  });

  it("can seed missing PracticeQ vitals and requeue a specific running job", async () => {
    (dbServer.practiceqAutomationJobDb.getByOrder as jest.Mock).mockResolvedValue({
      id: "job_1",
      orderId: "order_1",
      status: "running",
      attempts: 10,
      lastError: "Missing required patient vitals for IntakeQ",
    });
    (dbServer.practiceqAutomationJobDb.update as jest.Mock).mockResolvedValue({ id: "job_1" });

    const response = await POST(request({
      orderId: "order_1",
      answers: {
        pq_height: "5'10\"",
        pq_current_weight: "220",
        pq_ideal_weight: "180",
      },
    }));

    await expect(response.json()).resolves.toEqual({
      requeued: 1,
      jobs: ["job_1"],
      seeded: ["pq_height", "pq_current_weight", "pq_ideal_weight"],
    });
    expect(dbServer.answerDb.create).toHaveBeenCalledTimes(3);
    expect(dbServer.questionDb.upsert).toHaveBeenCalledTimes(3);
    expect(dbServer.practiceqAutomationJobDb.update).toHaveBeenCalledWith("job_1", {
      status: "queued",
      attempts: 0,
      lastError: undefined,
      lockedAt: undefined,
    });
  });
});
