/** @jest-environment node */

import fs from "fs";

describe("admin products pharmacy dose editing contract", () => {
  const page = fs.readFileSync("app/admin/products/page.tsx", "utf8");
  const createRoute = fs.readFileSync("app/api/admin/products/route.ts", "utf8");
  const updateRoute = fs.readFileSync("app/api/admin/products/[id]/route.ts", "utf8");

  it("exposes dose strength and pharmacy instructions in the admin product form", () => {
    expect(page).toContain("Pharmacy Vial / Strength");
    expect(page).toContain("Pharmacy Instructions");
    expect(page).toContain("prescriptionLabel");
    expect(page).toContain("updateDose");
  });

  it("sends editable doses through existing admin product APIs", () => {
    expect(page).toContain("doses: formData.doses");
    expect(createRoute).toContain("body.doses?.length ? body.doses");
    expect(updateRoute).toContain("...body");
  });
});
