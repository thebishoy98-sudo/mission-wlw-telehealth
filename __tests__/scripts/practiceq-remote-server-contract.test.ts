import fs from "fs";
import path from "path";

describe("PracticeQ remote server", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts/practiceq-remote-server.ts"), "utf8");

  it("persists the completed intake id returned by the worker", () => {
    expect(source).toContain("intakeId: result.intakeId");
  });
});
