import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("pharmacy dispatch idempotency contract", () => {
  const manualDispatch = read("app/api/orders/dispatch/route.ts");
  const serverDb = read("lib/db.server.ts");

  it("rejects a manual dispatch when a non-error pharmacy order exists", () => {
    expect(manualDispatch).toContain("pharmacyOrderDb.getByOrder(orderId)");
    expect(manualDispatch).toContain('existingPharmacyOrder.status !== "error"');
    expect(manualDispatch).toContain('"Order has already been dispatched to the pharmacy"');
    expect(manualDispatch).toContain("{ status: 409 }");
  });

  it("atomically claims dispatch only for paid, undispatched orders", () => {
    expect(serverDb).toContain("async claimPharmacyDispatch(orderId: string)");
    expect(serverDb).toContain("payment_status = 'completed'");
    expect(serverDb).toContain("pharmacy_status IN ('draft', 'error')");
    expect(serverDb).toContain("pharmacy_dispatch_claimed_at");
    expect(serverDb).toContain("INTERVAL '15 minutes'");
    expect(serverDb).toContain("NOT EXISTS (");
    expect(serverDb).toContain("status <> 'error'");
  });
});
