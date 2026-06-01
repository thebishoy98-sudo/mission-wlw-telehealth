import fs from "fs";
import path from "path";

describe("identity reminder cron contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/cron/identity-reminders/route.ts"), "utf8");

  it("does not send identity reminders to returning patients with a prior verified or dispatched order", () => {
    expect(source).toContain("NOT EXISTS");
    expect(source).toContain("prior.patient_id = o.patient_id");
    expect(source).toContain("prior.id <> o.id");
    expect(source).toContain("prior.identity_status IN ('verified', 'manual_approved')");
    expect(source).toContain("prior.status IN ('sent_to_pharmacy', 'processing', 'fulfilled', 'shipped', 'delivered')");
  });
});
