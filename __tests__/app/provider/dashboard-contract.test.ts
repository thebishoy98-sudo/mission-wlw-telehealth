import fs from "fs";
import path from "path";

describe("provider dashboard permissions", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/provider/page.tsx"), "utf8");

  it("does not expose admin-only identity review actions to providers", () => {
    expect(source).not.toContain("/api/identity/approve");
    expect(source).not.toContain("/provider/identity");
    expect(source).not.toContain("Review Identity");
    expect(fs.existsSync(path.join(process.cwd(), "app/provider/identity/[orderId]/page.tsx"))).toBe(false);
  });

  it("approve all only records provider chart approval and does not dispatch pharmacy", () => {
    expect(source).toContain("/api/provider/review");
    expect(source).not.toContain("/api/orders/dispatch");
  });
});
