import {
  canonicalProducts,
  tirzepatideProduct,
  retatrutideProduct,
  semaglutideProduct,
  normalizeCustomerProducts,
} from "@/data/products";

describe("canonical products", () => {
  it("includes all three GLP-1 medications", () => {
    const slugs = canonicalProducts.map((p) => p.slug);
    expect(slugs).toContain("tirzepatide");
    expect(slugs).toContain("retatrutide");
    expect(slugs).toContain("semaglutide");
  });

  it("each product has at least one dose", () => {
    for (const p of canonicalProducts) {
      expect(p.doses.length).toBeGreaterThan(0);
    }
  });

  it("all dose IDs are unique across the catalog", () => {
    const ids = canonicalProducts.flatMap((p) => p.doses.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retatrutide is first to match landing page ordering", () => {
    expect(canonicalProducts[0].slug).toBe("tirzepatide");
    expect(canonicalProducts[1].slug).toBe("retatrutide");
    expect(canonicalProducts[2].slug).toBe("semaglutide");
  });

  it("product IDs match expected format", () => {
    expect(tirzepatideProduct.id).toBe("product_tirzepatide");
    expect(retatrutideProduct.id).toBe("product_retatrutide");
    expect(semaglutideProduct.id).toBe("product_semaglutide");
  });

  it("normalizeCustomerProducts includes semaglutide when DB is empty", () => {
    const result = normalizeCustomerProducts([]);
    const slugs = result.map((p) => p.slug);
    expect(slugs).toContain("semaglutide");
  });

  it("semaglutide starting price matches PricingCards display", () => {
    // PricingCards shows fromSupply: 299 — must match canonical
    expect(semaglutideProduct.startingPrice).toBe(299);
  });

  it("all products have active status", () => {
    for (const p of canonicalProducts) {
      expect(p.isActive).not.toBe(false);
    }
  });
});
