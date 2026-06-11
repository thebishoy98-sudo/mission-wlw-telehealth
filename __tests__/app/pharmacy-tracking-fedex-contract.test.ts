import fs from "fs";
import path from "path";

describe("pharmacy tracking cron FedEx integration", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/pharmacy-tracking-sync/route.ts"),
    "utf8"
  );

  it("runs direct FedEx tracking sync from the existing pharmacy tracking cron", () => {
    expect(source).toContain("runFedExTrackingSync");
    expect(source).not.toContain("/api/cron/fedex-tracking-sync");
  });
});
