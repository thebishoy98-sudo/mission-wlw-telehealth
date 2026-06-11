import fs from "fs";
import path from "path";

describe("pharmacy tracking cron contract", () => {
  const renderYaml = fs.readFileSync(path.join(process.cwd(), "render.yaml"), "utf8");
  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/cron/pharmacy-tracking-sync/route.ts"), "utf8");
  const cronScriptSource = fs.readFileSync(path.join(process.cwd(), "scripts/run-pharmacy-tracking-cron.mjs"), "utf8");

  it("polls AppSheet/LifeFile tracking frequently enough that shipped orders do not wait for a daily sync", () => {
    expect(renderYaml).toContain("name: mission-wlw-cron-pharmacy-tracking");
    expect(renderYaml).toContain("schedule: \"*/15 * * * *\"");
    expect(cronScriptSource).toContain("/api/cron/pharmacy-tracking-sync");
  });

  it("accepts hosted cron GET requests instead of requiring a manual POST", () => {
    expect(routeSource).toContain("export async function GET(req: NextRequest)");
  });

  it("uses a script that waits for and logs the automatic cron HTTP response", () => {
    expect(renderYaml).toContain("node scripts/run-pharmacy-tracking-cron.mjs");
    expect(fs.existsSync(path.join(process.cwd(), "scripts/run-pharmacy-tracking-cron.mjs"))).toBe(true);
  });
});
