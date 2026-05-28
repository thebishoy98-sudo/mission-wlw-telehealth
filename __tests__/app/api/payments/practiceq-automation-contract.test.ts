import fs from "fs";
import path from "path";

describe("payment to PracticeQ automation contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");

  it("queues browser automation after payment instead of directly submitting PracticeQ from checkout", () => {
    expect(source).toContain("createPracticeQAutomationJob");
    expect(source).toContain("practiceqAutomationJobDb.create");
    expect(source).not.toContain("practiceq.submitIntakePacket");
  });

  it("does not swallow failed server PracticeQ job inserts as a pending state", () => {
    expect(source).toContain("await dbServer.practiceqAutomationJobDb.create(automationJob);");
    expect(source).toContain("PracticeQ automation queue failed");
  });
});
