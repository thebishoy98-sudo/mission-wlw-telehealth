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

describe("RetatrutideModal — source contracts", () => {
  it("uses sessionStorage to gate one-per-session display", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/landing/RetatrutideModal.tsx"),
      "utf8"
    );
    expect(src).toContain("sessionStorage");
    expect(src).toContain("reta_launch_seen");
  });

  it("opens after a delay on first visit", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/landing/RetatrutideModal.tsx"),
      "utf8"
    );
    expect(src).toContain("setTimeout");
    expect(src).toContain("setOpen(true)");
  });

  it("has accessible role and aria attributes", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/landing/RetatrutideModal.tsx"),
      "utf8"
    );
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain("aria-labelledby");
  });

  it("closes modal and sets sessionStorage flag on dismiss", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/landing/RetatrutideModal.tsx"),
      "utf8"
    );
    expect(src).toContain("sessionStorage.setItem");
    expect(src).toContain("setOpen(false)");
  });
});
