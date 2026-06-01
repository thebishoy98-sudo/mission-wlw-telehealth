import fs from "fs";
import path from "path";

describe("order number display contract", () => {
  const adminOrders = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");
  const providerChart = fs.readFileSync(path.join(process.cwd(), "app/provider/patients/[id]/page.tsx"), "utf8");

  it("shows the external pharmacy order number instead of only the internal id in admin details", () => {
    expect(adminOrders).toContain("getDisplayOrderNumber");
    expect(adminOrders).toContain("LifeFile order number");
    expect(adminOrders).toContain("Order ID");
    expect(adminOrders).not.toContain("Internal ID");
    expect(adminOrders).not.toContain("Order #");
    expect(adminOrders).not.toContain("<strong>ID:</strong> {selectedOrder.id.slice(-8)}");
  });

  it("shows the external pharmacy order number in provider chart details when available", () => {
    expect(providerChart).toContain("getDisplayOrderNumber");
    expect(providerChart).toContain("pharmacyOrder");
    expect(providerChart).toContain("LifeFile order number");
    expect(providerChart).toContain("Order ID");
    expect(providerChart).not.toContain("Internal ID");
  });
});
