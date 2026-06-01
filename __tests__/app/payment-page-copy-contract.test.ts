import fs from "fs";
import path from "path";

describe("payment page launch copy", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");

  it("does not show test-mode copy to patients when payment is enabled", () => {
    expect(source).toContain("paymentsDisabled ? \"Payment disabled\" : \"Secure payment\"");
    expect(source).not.toContain(">Test payment mode<");
  });

  it("does not require card fields when payments are disabled", () => {
    expect(source).toContain("const paymentsDisabled = !quickBooksPaymentsEnabled");
    expect(source).toContain("if (!productReady) return");
    expect(source).toContain("if (!paymentsDisabled &&");
    expect(source).toContain("paymentsDisabled ? \"Submit order\"");
    expect(source).toContain("!paymentsDisabled && (");
  });

  it("does not call the configured charge override a test charge in the patient checkout", () => {
    expect(source).toContain("Today's charge");
    expect(source).not.toContain("Testing charge override");
  });

  it("loads the selected product from the server catalog before pricing checkout", () => {
    expect(source).toContain('fetch("/api/products", { cache: "no-store" })');
    expect(source).toContain("setProduct(found ?? null)");
  });
});
