import fs from "fs";
import path from "path";
const repoRoot = process.cwd();
const publicEntryFiles = [
  "app/page.tsx",
  "app/products/page.tsx",
  "app/products/[id]/page.tsx",
  "app/login/LoginForm.tsx",
  "components/layout/Navbar.tsx",
];

describe("Mission payment-gated intake entry points", () => {
  it("uses the Mission intake as the public entry point so PracticeQ is not touched before payment", () => {
    for (const file of publicEntryFiles) {
      const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
      const usesMissionIntake =
        source.includes('href="/start/info"') ||
        (source.includes('base = "/start/info"') && source.includes("ctaUrl"));
      expect(usesMissionIntake).toBe(true);
      expect(source).not.toContain("PRACTICEQ_HOSTED_INTAKE_URL");
    }
  });

  it("keeps the Mission intake route active instead of redirecting to PracticeQ", () => {
    const source = fs.readFileSync(path.join(repoRoot, "app/start/info/page.tsx"), "utf8");

    expect(source).toContain('"use client"');
    expect(source).toContain("saveIntakeState");
    expect(source).not.toContain("redirect(PRACTICEQ_HOSTED_INTAKE_URL)");
  });
});
