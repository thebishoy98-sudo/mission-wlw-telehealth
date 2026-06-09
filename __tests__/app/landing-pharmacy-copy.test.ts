import { readFileSync } from "fs";
import path from "path";

describe("landing pharmacy copy", () => {
  it("uses US-based pharmacy copy instead of Licensed 503B Pharmacy labels", () => {
    const hero = readFileSync(path.join(process.cwd(), "components", "landing", "Hero.tsx"), "utf8");
    const retatrutideModal = readFileSync(
      path.join(process.cwd(), "components", "landing", "RetatrutideModal.tsx"),
      "utf8"
    );

    const source = `${hero}\n${retatrutideModal}`;

    expect(source).not.toContain("Licensed 503B Pharmacy");
    expect(source).toContain("US-Based Pharmacy");
  });
});
