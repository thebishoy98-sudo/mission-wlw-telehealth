import fs from "fs";
import path from "path";

describe("referral UI contracts", () => {
  const portal = fs.readFileSync(path.join(process.cwd(), "app/patient/page.tsx"), "utf8");
  const confirmation = fs.readFileSync(path.join(process.cwd(), "app/start/confirmation/page.tsx"), "utf8");

  it("loads the persisted referral link and real balance in the patient portal", () => {
    expect(portal).toContain('fetch("/api/patient/referral"');
    expect(portal).toContain("Available referral credit");
    expect(portal).not.toContain("patient_${patientId.slice(-8)}");
  });

  it("only advertises the offer after a real referral link is returned", () => {
    expect(confirmation).toContain("referralLink &&");
    expect(confirmation).not.toContain("Generating your referral link...");
  });
});
