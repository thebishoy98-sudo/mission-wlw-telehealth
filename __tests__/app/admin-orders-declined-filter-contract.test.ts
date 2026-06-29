import fs from "fs";
import path from "path";

describe("admin paid order filter contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

  it("shows only completed payments", () => {
    expect(source).toContain('import { isPaidAdminOrder } from "@/lib/admin-order-visibility"');
    expect(source).toContain('params.set("paidOnly", "true")');
    expect(source).toContain("const visibleOrders = orders.filter(isPaidAdminOrder)");
    expect(source).toContain("visibleOrders.map");
    expect(source).not.toContain("showDeclinedOrders");
    expect(source).not.toContain("Show payment declined");
  });
});
