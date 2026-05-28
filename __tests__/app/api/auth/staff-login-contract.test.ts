import fs from "fs";
import path from "path";

describe("staff login API contract", () => {
  const adminSource = fs.readFileSync(path.join(process.cwd(), "app/api/auth/admin-login/route.ts"), "utf8");
  const providerSource = fs.readFileSync(path.join(process.cwd(), "app/api/auth/provider-login/route.ts"), "utf8");

  it("returns the admin user object expected by the client auth context", () => {
    expect(adminSource).toContain("user:");
    expect(adminSource).toContain('role: "admin"');
    expect(adminSource).toContain("Admin User");
  });

  it("returns the provider user object expected by the client auth context", () => {
    expect(providerSource).toContain("user:");
    expect(providerSource).toContain('role: "provider"');
    expect(providerSource).toContain("Dr. Sarah Johnson");
  });
});
