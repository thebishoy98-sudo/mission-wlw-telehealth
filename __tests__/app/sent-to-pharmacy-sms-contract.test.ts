import fs from "fs";
import path from "path";

describe("sent to pharmacy SMS contract", () => {
  const files = [
    "app/api/payments/charge/route.ts",
    "app/api/payments/retry-order/route.ts",
    "app/api/webhooks/practiceq/route.ts",
    "app/api/orders/dispatch/route.ts",
    "lib/practiceq-session-completion.ts",
  ];

  it.each(files)("sends the patient pharmacy-preparing text when %s submits to pharmacy", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain("sendOrderSentToPharmacyMessage");
  });

  it("dedupes sent-to-pharmacy SMS by existing non-failed Spruce message", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "services/order-notifications.ts"), "utf8");
    expect(source).toContain('message.templateKey === "order_sent_to_pharmacy"');
    expect(source).toContain('message.status !== "failed"');
    expect(source).toContain('spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId })');
  });
});
