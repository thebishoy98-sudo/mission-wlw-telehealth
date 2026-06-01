import fs from "fs";
import path from "path";

describe("launch readiness smoke contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts/launch-readiness-smoke.ts"), "utf8");

  it("does not fetch multiple PracticeQ-backed order details in parallel", () => {
    expect(source).not.toContain("Promise.all(\n      orders.slice(0, 8).map");
    expect(source).toContain("for (const order of orders.slice(0, 8))");
    expect(source).toContain("return { order, patient, detail, strictChart: Boolean(query) };");
  });
});
