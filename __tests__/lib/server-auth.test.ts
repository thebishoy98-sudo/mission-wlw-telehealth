class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(headers: Record<string, string> = {}) {
    Object.entries(headers).forEach(([key, value]) => this.values.set(key.toLowerCase(), value));
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }
}

class TestRequest {
  headers: TestHeaders;

  constructor(_url: string, init: { headers?: Record<string, string> } = {}) {
    this.headers = new TestHeaders(init.headers);
  }
}

(global as any).Request = TestRequest;
(global as any).Response = class TestResponse {};

const { isAdminRequest, isProviderRequest } = require("@/lib/server-auth");
const { createStaffSessionToken } = require("@/lib/staff-session");

describe("server auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ADMIN_SECRET: "admin-secret", PROVIDER_SECRET: "provider-secret", VERCEL_ENV: "production" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("accepts admin secret from headers", () => {
    const req = new Request("https://example.com", { headers: { "x-admin-secret": "admin-secret" } });

    expect(isAdminRequest(req)).toBe(true);
  });

  it("accepts admin signed staff session cookie without NextRequest private state", () => {
    const token = createStaffSessionToken({ role: "admin", email: "admin@example.com", name: "Admin User" });
    const req = new Request("https://example.com", { headers: { cookie: `theme=dark; staff_session=${encodeURIComponent(token)}` } });

    expect(isAdminRequest(req)).toBe(true);
  });

  it("rejects raw admin secret cookies", () => {
    const req = new Request("https://example.com", { headers: { cookie: "admin_secret=admin-secret" } });

    expect(isAdminRequest(req)).toBe(false);
  });

  it("accepts provider signed staff session cookie", () => {
    const token = createStaffSessionToken({ role: "provider", email: "provider@example.com", name: "Dotson, Karen" });
    const req = new Request("https://example.com", { headers: { cookie: `staff_session=${encodeURIComponent(token)}` } });

    expect(isProviderRequest(req)).toBe(true);
  });
});
