/** @jest-environment node */

import fs from "fs";
import path from "path";

describe("SubscriptionsManager adjustment controls", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components/subscriptions/SubscriptionsManager.tsx"),
    "utf8"
  );

  it("lets staff update the dose used by automatic week-seven billing", () => {
    expect(source).toContain('"update_dose"');
    expect(source).toContain("Automatic refill dose");
    expect(source).toContain("Save dose");
  });

  it("lets staff charge and dispatch a supplemental dose increase", () => {
    expect(source).toContain('"charge_dose_adjustment"');
    expect(source).toContain("Increase dose / add medication");
    expect(source).toContain("Price difference");
    expect(source).toContain("Override reason");
    expect(source).toContain("charge the saved card and dispatch");
  });
});
