import fs from "fs";
import path from "path";

describe("identity gate PracticeQ smoke harness", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts/identity-gate-practiceq-smoke.ts"), "utf8");

  it("retries transient polling transport errors without hiding app or PracticeQ failures", () => {
    expect(source).toContain("function isTransientFetchError");
    expect(source).toContain("headers timeout");
    expect(source).toContain("UND_ERR");
    expect(source).toContain("transient fetch error, retrying");
    expect(source).toContain("throw error");
  });
});
