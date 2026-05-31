import fs from "fs";
import path from "path";

describe("consent page hydration", () => {
  it("does not read sessionStorage-backed intake state during the initial render", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/start/consent/page.tsx"), "utf8");

    expect(source).toContain("useState<IntakeFormState | null>(null)");
    expect(source).not.toContain("useState(getIntakeState())");
  });
});
