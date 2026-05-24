import {
  buildStripeIdentitySessionParams,
  getStripeIdentityConfig,
  isStripeIdentityConfigured,
} from "@/services/stripe-identity";

describe("stripe identity helpers", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...oldEnv };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it("reports disabled when required env vars are missing", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(isStripeIdentityConfigured(getStripeIdentityConfig())).toBe(false);
  });

  it("builds a document and selfie verification session payload", () => {
    const params = buildStripeIdentitySessionParams({
      orderId: "order_123",
      patientId: "patient_123",
      returnUrl: "https://mission-wlw-dev.vercel.app/verify-identity/token",
    });

    expect(params.get("type")).toBe("document");
    expect(params.get("provided_details[email]")).toBeNull();
    expect(params.get("options[document][require_matching_selfie]")).toBe("true");
    expect(params.get("metadata[order_id]")).toBe("order_123");
    expect(params.get("metadata[patient_id]")).toBe("patient_123");
    expect(params.get("return_url")).toBe("https://mission-wlw-dev.vercel.app/verify-identity/token");
  });
});
