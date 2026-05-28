import fs from "fs";
import path from "path";

describe("payment to PracticeQ automation contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");
  const legacyIntakeSource = fs.readFileSync(path.join(process.cwd(), "app/api/intake/submit/route.ts"), "utf8");

  it("queues browser automation after payment instead of directly submitting PracticeQ from checkout", () => {
    expect(source).toContain("createPracticeQAutomationJob");
    expect(source).toContain("practiceqAutomationJobDb.create");
    expect(source).not.toContain("practiceq.submitIntakePacket");
  });

  it("does not swallow failed server PracticeQ job inserts as a pending state", () => {
    expect(source).toContain("await dbServer.practiceqAutomationJobDb.create(automationJob);");
    expect(source).toContain("PracticeQ automation queue failed");
  });

  it("wakes the remote PracticeQ worker immediately after queueing the job", () => {
    expect(source).toContain("wakePracticeQRemoteWorker");
    expect(source).toContain("PRACTICEQ_REMOTE_PUBLIC_URL");
  });

  it("temporarily bypasses live QuickBooks payment and accounting while the intake automation is tested", () => {
    expect(source).toContain("shouldBypassQuickBooksPayment");
    expect(source).toContain("Payment bypassed for integration testing");
    expect(source).toContain("QuickBooks accounting sync skipped");
    expect(source).toContain('quickbooksStatus: "skipped"');
  });

  it("uses the persisted server product for QuickBooks invoices", () => {
    expect(source).toContain("product: persistedProduct ?? productData ?? null");
    expect(source).not.toContain("product: productData ?? null,\n        qbCustomerId");
  });

  it("does not submit the legacy intake route to PracticeQ before payment", () => {
    expect(legacyIntakeSource).not.toContain("submitIntakePacket");
    expect(legacyIntakeSource).toContain("/api/payments/charge");
  });
});
