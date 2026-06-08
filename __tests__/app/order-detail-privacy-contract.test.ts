import fs from "fs";
import path from "path";

describe("order detail privacy contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/orders/[id]/route.ts"), "utf8");

  it("does not return the raw order object to public email-based lookups", () => {
    expect(source).toContain("isPrivilegedRequest");
    expect(source).toContain("order: isPrivilegedRequest");
    expect(source).not.toContain("identityUploadToken");
    expect(source).not.toContain("order,\r\n    patient:");
    expect(source).not.toContain("order,\n    patient:");
  });

  it("only loads and returns PracticeQ details for privileged users", () => {
    expect(source).toContain("const practiceqMirror = isPrivilegedRequest");
    expect(source).toContain("practiceq: isPrivilegedRequest");
    expect(source).toContain("identity: canViewIdentity");
    expect(source).toContain("diagnostics: canViewIdentity");
  });
});
