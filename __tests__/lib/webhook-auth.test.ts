import { validateSharedSecret } from "@/lib/webhook-auth";

describe("validateSharedSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns a controlled service unavailable error when a production webhook secret is missing", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.PRACTICEQ_WEBHOOK_KEY;

    const result = validateSharedSecret({
      configuredSecret: process.env.PRACTICEQ_WEBHOOK_KEY,
      providedSecret: null,
      serviceName: "PracticeQ",
      envName: "PRACTICEQ_WEBHOOK_KEY",
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "PracticeQ webhook is not configured",
    });
  });

  it("rejects invalid webhook secrets when configured", () => {
    process.env.VERCEL_ENV = "production";

    const result = validateSharedSecret({
      configuredSecret: "expected",
      providedSecret: "wrong",
      serviceName: "PracticeQ",
      envName: "PRACTICEQ_WEBHOOK_KEY",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });
});
