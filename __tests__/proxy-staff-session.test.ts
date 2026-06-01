import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { createStaffSessionToken } from "@/lib/staff-session";

let verifyStaffSessionCookieForProxy: typeof import("@/proxy").verifyStaffSessionCookieForProxy;

describe("proxy staff session auth", () => {
  const originalEnv = process.env;
  const originalCrypto = globalThis.crypto;
  const originalRequest = globalThis.Request;
  const originalResponse = globalThis.Response;
  const originalTextEncoder = globalThis.TextEncoder;

  beforeAll(() => {
    Object.defineProperty(globalThis, "Request", {
      configurable: true,
      value: class TestRequest {},
    });
    Object.defineProperty(globalThis, "Response", {
      configurable: true,
      value: class TestResponse {},
    });
    Object.defineProperty(globalThis, "TextEncoder", {
      configurable: true,
      value: TextEncoder,
    });
    ({ verifyStaffSessionCookieForProxy } = require("@/proxy"));
  });

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1_780_200_000_000);
    process.env = {
      ...originalEnv,
      STAFF_SESSION_SECRET: "staff-secret",
      ADMIN_SECRET: "admin-secret",
    };
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: webcrypto,
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "Request", {
      configurable: true,
      value: originalRequest,
    });
    Object.defineProperty(globalThis, "Response", {
      configurable: true,
      value: originalResponse,
    });
    Object.defineProperty(globalThis, "TextEncoder", {
      configurable: true,
      value: originalTextEncoder,
    });
  });

  it("accepts a signed admin staff session at the edge proxy", async () => {
    const token = createStaffSessionToken({
      role: "admin",
      email: "admin@example.com",
      name: "Admin User",
    });

    await expect(verifyStaffSessionCookieForProxy(token, "admin")).resolves.toBe(true);
  });

  it("rejects provider and tampered staff sessions for admin routes", async () => {
    const providerToken = createStaffSessionToken({
      role: "provider",
      email: "provider@example.com",
      name: "Dotson, Karen",
    });
    const adminToken = createStaffSessionToken({
      role: "admin",
      email: "admin@example.com",
      name: "Admin User",
    });

    await expect(verifyStaffSessionCookieForProxy(providerToken, "admin")).resolves.toBe(false);
    await expect(verifyStaffSessionCookieForProxy(`${adminToken}tampered`, "admin")).resolves.toBe(false);
  });
});
