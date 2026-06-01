import fs from "fs";
import path from "path";

describe("provider patient page", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/provider/patients/[id]/page.tsx"), "utf8");

  it("renders chart review audit UI separately from identity verification", () => {
    expect(source).toContain("Chart Review Audit");
    expect(source).toContain("Mark Chart as Reviewed");
    expect(source).toContain("mark_chart_viewed");
    expect(source).toContain("api/provider/patients");
    expect(source).toContain("orderId");
    expect(source).toContain("encodeURIComponent(orderId)");
  });

  it("does not render payment or pharmacy fulfillment details in the provider chart sidebar", () => {
    expect(source).not.toContain("Card ending");
    expect(source).not.toContain("LifeFile ID");
    expect(source).not.toContain("Sent to Pharmacy");
    expect(source).not.toContain("No manual action required");
  });

  it("does not let providers approve, reject, dispatch, or review identity", () => {
    expect(source).not.toContain("/api/orders/dispatch");
    expect(source).not.toContain("/api/identity/approve");
    expect(source).not.toContain("Review Identity");
    expect(source).not.toContain("Approve Order");
    expect(source).not.toContain("Reject Order");
    expect(source).not.toContain("handleApprove");
    expect(source).not.toContain("handleReject");
  });
});
