import { readFileSync } from "fs";
import path from "path";

describe("generic login page", () => {
  const source = readFileSync(path.join(process.cwd(), "app", "login", "page.tsx"), "utf8");

  it("only renders the patient login entry point", () => {
    expect(source).toContain('<LoginForm role="patient"');
    expect(source).not.toContain("/login/provider");
    expect(source).not.toContain("/login/admin");
  });
});

describe("portal login branding", () => {
  const source = readFileSync(path.join(process.cwd(), "app", "login", "LoginForm.tsx"), "utf8");

  it("uses the Mission icon instead of a letter badge", () => {
    expect(source).toContain('src="/mission-logo-icon.jpeg"');
    expect(source).not.toContain(">M</span>");
  });
});
