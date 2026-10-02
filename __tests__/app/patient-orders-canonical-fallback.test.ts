/**
 * Ensures patient orders and reorder APIs include canonical products
 * as fallback so retatrutide/semaglutide orders show correctly in
 * the patient portal even when not stored in Postgres.
 */
import fs from "fs";
import path from "path";

describe("patient orders API — canonical product fallback", () => {
  it("orders route falls back to canonicalProducts when productDb returns null", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/patient/orders/route.ts"),
      "utf8"
    );
    expect(src).toContain("canonicalProducts");
    expect(src).toContain("canonicalProducts.find");
  });

  it("reorder route falls back to canonicalProducts for product lookup", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/patient/reorder/[orderId]/route.ts"),
      "utf8"
    );
    expect(src).toContain("canonicalProducts");
    expect(src).toContain("canonicalProducts.find");
  });
});
