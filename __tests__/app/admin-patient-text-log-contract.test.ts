import fs from "fs";
import path from "path";

describe("admin patient text log contract", () => {
  const adminOrdersPage = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");
  const orderDetailRoute = fs.readFileSync(path.join(process.cwd(), "app/api/orders/[id]/route.ts"), "utf8");

  it("returns Spruce patient text messages in the order detail API", () => {
    expect(orderDetailRoute).toContain("spruceMessages");
    expect(orderDetailRoute).toContain("dbServer.spruceMessageDb.getByOrder(order.id)");
    expect(orderDetailRoute).toContain("messageText");
    expect(orderDetailRoute).toContain("sentAt");
    expect(orderDetailRoute).toContain("createdAt");
  });

  it("renders patient text updates with timestamps in the admin detail panel", () => {
    expect(adminOrdersPage).toContain("selectedSpruceMessages");
    expect(adminOrdersPage).toContain("Patient Text Updates");
    expect(adminOrdersPage).toContain("formatDateTime(message.createdAt)");
    expect(adminOrdersPage).toContain("formatDateTime(message.sentAt)");
    expect(adminOrdersPage).toContain("message.messageText");
  });
});
