import { existsSync, readFileSync } from "fs";
import path from "path";

describe("patient OTP auth routes", () => {
  const requestRoute = path.join(process.cwd(), "app", "api", "auth", "patient-otp", "request", "route.ts");
  const verifyRoute = path.join(process.cwd(), "app", "api", "auth", "patient-otp", "verify", "route.ts");

  it("has request and verify endpoints backed by Spruce SMS", () => {
    expect(existsSync(requestRoute)).toBe(true);
    expect(existsSync(verifyRoute)).toBe(true);
    expect(readFileSync(requestRoute, "utf8")).toContain("sendTextToPhone");
    expect(readFileSync(verifyRoute, "utf8")).toContain("patientLoginOtpDb");
  });
});
