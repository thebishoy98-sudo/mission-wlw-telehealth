import { canonicalProducts } from "@/data/products";

describe("testing product pricing", () => {
  it("sets all visible product and dose prices to one cent", () => {
    for (const product of canonicalProducts) {
      expect(product.startingPrice).toBe(0.01);

      for (const dose of product.doses) {
        expect(dose.price).toBe(0.01);
      }
    }
  });
});

