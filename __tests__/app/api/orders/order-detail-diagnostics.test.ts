import fs from "fs";
import path from "path";

describe("order detail diagnostics", () => {
  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/orders/[id]/route.ts"), "utf8");
  const adminSource = fs.readFileSync(path.join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

  it("returns integration logs and PracticeQ automation status for admin error details", () => {
    expect(routeSource).toContain("integrationLogDb.getByOrder");
    expect(routeSource).toContain("practiceqAutomationJobDb.getByOrder");
    expect(routeSource).toContain("diagnostics");
  });

  it("uses the PracticeQ automation intake id as a mirror lookup fallback", () => {
    expect(routeSource).toContain("practiceqAutomationJob?.intakeId");
    expect(routeSource).toContain("getPracticeQMirrorForOrder(order, practiceqPacket, practiceqAutomationJob?.intakeId)");
  });

  it("renders integration error details instead of only showing Error badges", () => {
    expect(adminSource).toContain("selectedDiagnostics");
    expect(adminSource).toContain("Latest Integration Details");
    expect(adminSource).toContain("PracticeQ Automation");
  });
});
