import {
  createStaffSessionToken,
  verifyStaffSessionToken,
  getStaffSessionFromRequest,
} from "@/lib/staff-session";

describe("staff session tokens", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(Date, "now").mockReturnValue(1_780_200_000_000);
    process.env = { ...originalEnv, STAFF_SESSION_SECRET: "staff-secret" };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("verifies a signed admin session", () => {
    const token = createStaffSessionToken({
      role: "admin",
      email: "admin@example.com",
      name: "Admin User",
    });

    expect(verifyStaffSessionToken(token)).toMatchObject({
      role: "admin",
      email: "admin@example.com",
      name: "Admin User",
    });
  });

  it("rejects tampered staff sessions", () => {
    const token = createStaffSessionToken({
      role: "provider",
      email: "provider@example.com",
      name: "Dotson, Karen",
    });

    expect(verifyStaffSessionToken(`${token}tampered`)).toBeNull();
  });

  it("reads the staff session cookie from requests", () => {
    const token = createStaffSessionToken({
      role: "provider",
      email: "provider@example.com",
      name: "Dotson, Karen",
    });
    const req = {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "cookie"
            ? `staff_session=${encodeURIComponent(token)}`
            : null,
      },
    } as unknown as Request;

    expect(getStaffSessionFromRequest(req)).toMatchObject({ role: "provider" });
  });
});
