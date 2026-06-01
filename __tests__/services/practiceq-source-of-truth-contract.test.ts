import fs from "fs";
import path from "path";

describe("PracticeQ chart media source-of-truth contract", () => {
  const repoRoot = process.cwd();
  const practiceqSource = fs.readFileSync(path.join(repoRoot, "services/practiceq.ts"), "utf8");
  const dbServerSource = fs.readFileSync(path.join(repoRoot, "lib/db.server.ts"), "utf8");
  const completionSource = fs.readFileSync(path.join(repoRoot, "lib/practiceq-session-completion.ts"), "utf8");

  it("purges temporary identity media after PracticeQ file upload succeeds", () => {
    expect(practiceqSource).toContain("markIdentityUploadStoredInPracticeQ");
    expect(practiceqSource).toContain("practiceq://files/");
    expect(practiceqSource).toContain('base64Data: ""');
    expect(dbServerSource).toContain("async markStoredInPracticeQ");
  });

  it("stores sanitized upload metadata in PracticeQ packets instead of staged base64 media", () => {
    expect(completionSource).toContain("files.uploads");
    expect(completionSource).not.toContain("uploads: previousPacketData?.uploads ?? uploads");
  });
});
