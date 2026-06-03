import fs from "fs";
import path from "path";

describe("consent page hydration", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/start/consent/page.tsx"), "utf8");

  it("does not read sessionStorage-backed intake state during the initial render", () => {
    expect(source).toContain("useState<IntakeFormState | null>(null)");
    expect(source).not.toContain("useState(getIntakeState())");
  });

  it("requires the typed signature to match the patient legal name", () => {
    expect(source).toContain("doesSignatureMatchPatient");
    expect(source).toContain("Signature must match the patient name");
  });
});
