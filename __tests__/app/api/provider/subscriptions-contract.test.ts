/** @jest-environment node */

import fs from "fs";
import path from "path";

describe("provider subscription dose adjustment contract", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/provider/subscriptions/route.ts"),
    "utf8"
  );

  it("supports changing the dose before the automatic charge", () => {
    expect(route).toContain('action === "update_dose"');
    expect(route).toContain("doseId: requestedDoseId");
  });

  it("charges and fulfills a supplemental dose increase after billing", () => {
    expect(route).toContain('action === "charge_dose_adjustment"');
    expect(route).toContain("calculateSupplementalCharge");
    expect(route).toContain("qbPayments.chargeStoredCard");
    expect(route).toContain("fulfillChargedRefillOrder");
    expect(route).toContain("requestId: order.id");
  });
});
