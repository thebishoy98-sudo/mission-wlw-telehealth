import {
  buildTrackingScriptAuthHeader,
  extractTrackingScriptUpdates,
  isTrackingScriptConfigured,
} from "@/services/pharmacy-tracking-script";

describe("pharmacy-tracking-script", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("detects complete Google Apps Script tracking configuration", () => {
    process.env.PHARMACY_TRACKING_SCRIPT_URL = "https://script.google.com/macros/s/example/exec";
    process.env.PHARMACY_TRACKING_SCRIPT_USERNAME = "user";
    process.env.PHARMACY_TRACKING_SCRIPT_PASSWORD = "pass";

    expect(isTrackingScriptConfigured()).toBe(true);
  });

  it("builds a Basic auth header without exposing raw credentials", () => {
    expect(buildTrackingScriptAuthHeader("user", "pass")).toBe("Basic dXNlcjpwYXNz");
  });

  it("extracts tracking updates from common script response shapes", () => {
    expect(extractTrackingScriptUpdates({ updates: [{ orderId: "1" }] })).toEqual([{ orderId: "1" }]);
    expect(extractTrackingScriptUpdates({ data: [{ orderId: "2" }] })).toEqual([{ orderId: "2" }]);
    expect(extractTrackingScriptUpdates([{ orderId: "3" }])).toEqual([{ orderId: "3" }]);
    expect(extractTrackingScriptUpdates({ orderId: "4", trackingNumber: "1Z" })).toEqual([
      { orderId: "4", trackingNumber: "1Z" },
    ]);
  });
});
