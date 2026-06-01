import fs from "fs";
import path from "path";

describe("admin dashboard loading contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");
  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/admin/dashboard/route.ts"), "utf8");

  it("shows an explicit loading and error state instead of real-looking zero metrics", () => {
    expect(source).toContain("const [loading, setLoading] = useState(true)");
    expect(source).toContain("const [error, setError] = useState(\"\")");
    expect(source).toContain("Loading admin dashboard data...");
    expect(source).toContain("Could not load admin dashboard data");
  });

  it("does not silently fall back to browser session data for admin metrics", () => {
    expect(source).not.toContain("import * as db from \"@/lib/db\"");
    expect(source).not.toContain("let allOrders = db.orderDb.getAll()");
    expect(source).not.toContain("Keep local fallback");
  });

  it("keeps dashboard list loading fast by leaving PracticeQ hydration to detail pages", () => {
    expect(routeSource).not.toContain("getPracticeQMirrorForOrder");
    expect(routeSource).not.toContain("hydratePatientFromPracticeQ");
    expect(routeSource).not.toContain("resolvePatient(order)");
    expect(routeSource).not.toContain("orders.map(resolveAdminPatient)");
    expect(routeSource).toContain("loadDashboardPatientMap(pagedOrders)");
  });
});
