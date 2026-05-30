import fs from "fs";
import path from "path";

describe("PracticeQ remote server", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts/practiceq-remote-server.ts"), "utf8");

  it("persists the completed intake id returned by the worker", () => {
    expect(source).toContain("intakeId: result.intakeId");
  });

  it("exposes live browser controls so an agent can inject information mid-intake", () => {
    expect(source).toContain('action === "screenshot"');
    expect(source).toContain('action === "click"');
    expect(source).toContain('action === "type"');
    expect(source).toContain('action === "key"');
    expect(source).toContain('action === "done"');
    expect(source).toContain("session.page.mouse.click");
    expect(source).toContain("session.page.keyboard.insertText");
  });
});
