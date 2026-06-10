import fs from "fs";
import path from "path";

describe("pharmacy tracking cron contract", () => {
  const renderYaml = fs.readFileSync(path.join(process.cwd(), "render.yaml"), "utf8");

  it("polls AppSheet/LifeFile tracking frequently enough that shipped orders do not wait for a daily sync", () => {
    expect(renderYaml).toContain("name: mission-wlw-cron-pharmacy-tracking");
    expect(renderYaml).toContain("schedule: \"*/15 * * * *\"");
    expect(renderYaml).toContain("/api/cron/pharmacy-tracking-sync");
  });
});
