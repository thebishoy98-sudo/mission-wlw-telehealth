import fs from "fs";
import path from "path";

describe("PracticeQ chart media source-of-truth contract", () => {
  const repoRoot = process.cwd();
  const practiceqSource = fs.readFileSync(path.join(repoRoot, "services/practiceq.ts"), "utf8");
  const dbServerSource = fs.readFileSync(path.join(repoRoot, "lib/db.server.ts"), "utf8");
  const completionSource = fs.readFileSync(path.join(repoRoot, "lib/practiceq-session-completion.ts"), "utf8");
  const adminOrdersSource = fs.readFileSync(path.join(repoRoot, "app/admin/orders/page.tsx"), "utf8");

  it("purges temporary identity media after PracticeQ file upload succeeds", () => {
    expect(practiceqSource).toContain("markIdentityUploadStoredInPracticeQ");
    expect(practiceqSource).toContain("practiceq://files/");
    expect(practiceqSource).toContain('base64Data: ""');
    expect(dbServerSource).toContain("async markStoredInPracticeQ");
    expect(dbServerSource).toContain("async purgeBase64ByOrder");
  });

  it("stores sanitized upload metadata in PracticeQ packets instead of staged base64 media", () => {
    expect(completionSource).toContain("files.uploads");
    expect(completionSource).not.toContain("uploads: previousPacketData?.uploads ?? uploads");
  });

  it("purges local chart PHI after PracticeQ chart files are attached", () => {
    expect(dbServerSource).toContain("async deleteByOrder(orderId: string)");
    expect(dbServerSource).toContain("DELETE FROM questionnaire_answers WHERE order_id");
    expect(dbServerSource).toContain("DELETE FROM consent_records WHERE order_id");
    expect(completionSource).toContain("purgeMissionChartPhi");
    expect(completionSource).toContain("answerDb.deleteByOrder");
    expect(completionSource).toContain("consentDb.deleteByOrder");
    expect(completionSource).toContain("uploadDb.purgeBase64ByOrder");
    expect(completionSource).toContain("Local chart PHI purged after PracticeQ attachment");
  });

  it("does not persist copied questionnaire answers or consent body in PracticeQ packet rows", () => {
    expect(completionSource).toContain("questionnaireAnswers: []");
    expect(completionSource).toContain("consentRecord: consent ? { id: consent.id } : {}");
    expect(completionSource).not.toContain("questionnaireAnswers: previousPacketData?.questionnaireAnswers ?? answers");
    expect(completionSource).not.toContain("consentRecord: previousPacketData?.consentRecord ?? (consent ?? {})");
    expect(completionSource).not.toContain("questionnaireAnswers: answers");
    expect(completionSource).not.toContain("consentRecord: consent ?? {}");
  });

  it("keeps admin chart access pointed at PracticeQ files after local PHI purge", () => {
    expect(adminOrdersSource).toContain("selectedPracticeQ.answerFileId");
    expect(adminOrdersSource).toContain("selectedPracticeQ.pdfFileId");
    expect(adminOrdersSource).toContain("Answers JSON");
    expect(adminOrdersSource).toContain("Chart PDF");
    expect(adminOrdersSource).toContain('["/api/provider/", "practice", "q-files/", fileId].join("")');
  });
});
