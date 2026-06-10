import fs from "fs";
import path from "path";

describe("admin declined order filter contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

  it("hides payment-declined orders by default and can include them on demand", () => {
    expect(source).toContain("showDeclinedOrders, setShowDeclinedOrders");
    expect(source).toContain("visibleOrders");
    expect(source).toContain('order.paymentStatus !== "failed"');
    expect(source).toContain("Show payment declined");
    expect(source).toContain("checked={showDeclinedOrders}");
    expect(source).toContain("visibleOrders.map");
  });
});
