import fs from "fs";
import path from "path";

describe("admin tracking link contract", () => {
  const adminOrdersPage = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

  it("shows a FedEx tracking link next to shipped order status in the detail panel", () => {
    expect(adminOrdersPage).toContain("selectedPharmacyOrder?.trackingNumber?.trim()");
    expect(adminOrdersPage).toContain("getFedExTrackingUrl(selectedTrackingNumber)");
    expect(adminOrdersPage).toContain("Tracking:");
    expect(adminOrdersPage).toContain('target="_blank"');
  });
});
