import { normalizeCustomerProducts, tirzepatideProduct } from "@/data/products";
import type { Product } from "@/types";

const makeProduct = (id: string, name: string, slug: string): Product => ({
  ...tirzepatideProduct,
  id,
  name,
  slug,
});

describe("normalizeCustomerProducts", () => {
  it("hides test products and dedupes repeated customer treatments", () => {
    const products = normalizeCustomerProducts([
      makeProduct("demo_1", "Demo Product", "demo-product"),
      makeProduct("prod_1", "Prod", "prod"),
      makeProduct("tirz_old", "Tirzepatide", "tirzepatide"),
      makeProduct(tirzepatideProduct.id, "Tirzepatide", "tirzepatide"),
      makeProduct("tirz_copy", "Tirzepatide", "tirzepatide"),
    ]);

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: tirzepatideProduct.id,
      name: "Tirzepatide",
      slug: "tirzepatide",
    });
  });
});
