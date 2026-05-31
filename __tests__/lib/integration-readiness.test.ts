import { getSpruceReadiness } from "@/lib/integration-readiness";

describe("getSpruceReadiness", () => {
  it("reports every reason Spruce cannot send live SMS", () => {
    const readiness = getSpruceReadiness({});

    expect(readiness).toMatchObject({
      liveSending: false,
      configured: false,
      hasPhoneEndpoint: false,
      ready: false,
    });
    expect(readiness.problems).toEqual([
      "USE_REAL_SPRUCE is not true",
      "Spruce credentials are missing",
      "SPRUCE_INTERNAL_ENDPOINT_ID is missing",
    ]);
  });

  it("is ready only when live sending, credentials, and endpoint are present", () => {
    const readiness = getSpruceReadiness({
      USE_REAL_SPRUCE: "true",
      SPRUCE_AUTH_TOKEN: "token",
      SPRUCE_INTERNAL_ENDPOINT_ID: "endpoint",
    });

    expect(readiness).toMatchObject({
      liveSending: true,
      configured: true,
      hasPhoneEndpoint: true,
      ready: true,
      problems: [],
    });
  });

  it("accepts access id plus api key as Spruce credentials", () => {
    const readiness = getSpruceReadiness({
      USE_REAL_SPRUCE: "true",
      SPRUCE_ACCESS_ID: "access",
      SPRUCE_API_KEY: "key",
      SPRUCE_INTERNAL_ENDPOINT_ID: "endpoint",
    });

    expect(readiness.ready).toBe(true);
  });
});
