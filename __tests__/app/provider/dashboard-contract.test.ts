import fs from "fs";
import path from "path";

describe("provider dashboard permissions", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/provider/page.tsx"), "utf8");
  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/provider/dashboard/route.ts"), "utf8");

  it("does not expose admin-only identity review actions to providers", () => {
    expect(source).not.toContain("/api/identity/approve");
    expect(source).not.toContain("/provider/identity");
    expect(source).not.toContain("Review Identity");
    expect(fs.existsSync(path.join(process.cwd(), "app/provider/identity/[orderId]/page.tsx"))).toBe(false);
  });

  it("only lets providers mark charts reviewed, not approve or deny orders", () => {
    expect(source).toContain("Mark All Reviewed");
    expect(source).toContain("mark_chart_viewed");
    expect(source).toContain("?orderId=");
    expect(source).toContain("encodeURIComponent(order.id)");
    expect(source).not.toContain("Approve All");
    expect(source).not.toContain("approve");
    expect(source).not.toContain("reject");
    expect(source).not.toContain("/api/orders/dispatch");
  });

  it("shows provider as Karen instead of the legacy demo doctor", () => {
    const navbarSource = fs.readFileSync(path.join(process.cwd(), "components/layout/Navbar.tsx"), "utf8");

    expect(navbarSource).toContain("Karen");
    expect(navbarSource).not.toContain("Sarah Johnson");
  });

  it("keeps the dashboard summary fast by leaving PracticeQ hydration to chart detail pages", () => {
    expect(routeSource).not.toContain("getPracticeQMirrorForOrder");
    expect(routeSource).not.toContain("hydratePatientFromPracticeQ");
    expect(routeSource).not.toContain("orders.map(resolveProviderPatient)");
  });
});
