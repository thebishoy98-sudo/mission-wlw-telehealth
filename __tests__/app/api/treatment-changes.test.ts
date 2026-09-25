/** @jest-environment node */
jest.mock("@/lib/server-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/staff-session", () => ({ getStaffSessionFromRequest: () => ({ email: "admin@example.com" }) }));
jest.mock("@/lib/db.server", () => ({ sql: jest.fn(), productDb: { getById: jest.fn(), getAll: jest.fn() } }));
import { POST } from "@/app/api/admin/treatment-changes/route";
import { requireAdmin } from "@/lib/server-auth";
import { sql, productDb } from "@/lib/db.server";
const request = (body: unknown) => new Request("https://example.com/api/admin/treatment-changes", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  (requireAdmin as jest.Mock).mockReturnValue(null);
  (productDb.getById as jest.Mock).mockResolvedValue({ id: "tirz", isActive: true, doses: [{ id: "dose", price: 349, weeklyDoseMg: 2.5, durationWeeks: 8 }] });
});
test("rejects non-admin requests without touching subscriptions", async () => {
  (requireAdmin as jest.Mock).mockReturnValue(new Response(null, { status: 401 }));
  expect((await POST(request({}))).status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});
test("requires an explicit provider approval", async () => {
  expect((await POST(request({ doseId: "dose" }))).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
});
test("rejects an invalid dose", async () => {
  expect((await POST(request({ productId: "tirz", previousProductId: "reta", previousDoseId: "old_dose", providerApproved: true, providerName: "Provider", doseId: "invalid" }))).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
});
test("reports a concurrent change instead of claiming success", async () => {
  (sql as jest.Mock).mockResolvedValue({ rows: [] });
  expect((await POST(request({ subscriptionId: "sub", productId: "tirz", previousProductId: "reta", previousDoseId: "old_dose", providerApproved: true, providerName: "Provider", doseId: "dose" }))).status).toBe(409);
});
test("saves a validated replacement", async () => {
  (sql as jest.Mock).mockResolvedValue({ rows: [{ id: "sub" }] });
  expect((await POST(request({ subscriptionId: "sub", productId: "tirz", previousProductId: "reta", previousDoseId: "old_dose", providerApproved: true, providerName: "Provider", doseId: "dose" }))).status).toBe(200);
});
