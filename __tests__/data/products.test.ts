import { normalizeCustomerProducts, tirzepatideProduct } from "@/data/products";
import type { Product } from "@/types";

const makeProduct = (id: string, name: string, slug: string): Product => ({
  ...tirzepatideProduct,
  id,
  name,
  slug,
});

describe("normalizeCustomerProducts", () => {
  it("publishes the exact 8-week Tirzepatide catalog and prices", () => {
    expect(tirzepatideProduct.doses.map((dose) => ({
      label: dose.label,
      patientDescription: dose.patientDescription,
      price: dose.price,
    }))).toEqual([
      { label: "Tirzepatide 20mg", patientDescription: "8-Week Prescription", price: 349 },
      { label: "Tirzepatide 40mg", patientDescription: "8-Week Prescription", price: 479 },
      { label: "Tirzepatide 60mg", patientDescription: "8-Week Prescription", price: 749 },
    ]);
  });

  it("hides test products and dedupes repeated customer treatments", () => {
    const products = normalizeCustomerProducts([
      makeProduct("demo_1", "Demo Product", "demo-product"),
      makeProduct("prod_1", "Prod", "prod"),
      makeProduct("tirz_old", "Tirzepatide", "tirzepatide"),
      makeProduct(tirzepatideProduct.id, "Tirzepatide", "tirzepatide"),
      makeProduct("tirz_copy", "Tirzepatide", "tirzepatide"),
    ]);

    // All canonical products are returned while duplicate DB rows are deduped.
    expect(products).toHaveLength(5);
    const tirz = products.find((p) => p.slug === "tirzepatide");
    expect(tirz).toMatchObject({
      id: tirzepatideProduct.id,
      name: "Tirzepatide",
      slug: "tirzepatide",
    });
  });

  it("normalizes old Tirzepatide product images to the branded vial", () => {
    const oldProduct = makeProduct("tirz_old", "Tirzepatide", "tirzepatide");
    oldProduct.image = "/product-tirzepatide.svg";

    const products = normalizeCustomerProducts([oldProduct]);

    const tirz = products.find((p) => p.slug === "tirzepatide");
    expect(tirz?.image).toBe("/tirzepatide-vial.jpg");
  });
});
