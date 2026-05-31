import fs from "fs";
import path from "path";

describe("patient portal reorder and tracking contract", () => {
  const patientPage = fs.readFileSync(path.join(process.cwd(), "app/patient/page.tsx"), "utf8");
  const patientOrdersRoute = fs.readFileSync(path.join(process.cwd(), "app/api/patient/orders/route.ts"), "utf8");
  const infoPage = fs.readFileSync(path.join(process.cwd(), "app/start/info/page.tsx"), "utf8");

  it("shows tracking inline on order cards and removes the separate track order button", () => {
    expect(patientOrdersRoute).toContain("pharmacyOrders");
    expect(patientPage).toContain("Tracking number:");
    expect(patientPage).toContain("Tracking number will be provided here once your order ships.");
    expect(patientPage).not.toContain("Track order status");
  });

  it("starts a reorder from the latest ordered product and dose while keeping dose editable", () => {
    expect(patientPage).toContain("handleReorder");
    expect(patientPage).toContain("productId: order.productId");
    expect(patientPage).toContain("doseId: order.doseId");
    expect(patientPage).toContain('router.push("/start/info?reorder=1")');
    expect(infoPage).toContain("formData.doseId");
    expect(infoPage).toContain("setSelectedDose(formData.doseId)");
  });
});
