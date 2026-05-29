import fs from "fs";
import path from "path";

describe("admin orders dispatch action", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

  it("renders a pharmacy dispatch action near the PracticeQ and payment detail cards", () => {
    const practiceQIndex = source.indexOf("<h3 className=\"font-bold text-gray-900 mb-4\">PracticeQ</h3>");
    const dispatchIndex = source.indexOf("Pharmacy Dispatch");
    const paymentIndex = source.indexOf("<h3 className=\"font-bold text-gray-900 mb-2\">Payment</h3>");

    expect(practiceQIndex).toBeGreaterThanOrEqual(0);
    expect(dispatchIndex).toBeGreaterThan(practiceQIndex);
    expect(dispatchIndex).toBeLessThan(paymentIndex);
    expect(source).toContain("handleSendToPharmacy(selectedOrder)");
  });
});
