import fs from "fs";
import path from "path";

describe("identity approval route", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/identity/approve/route.ts"), "utf8");

  it("loads provider review state from Postgres before local fallback", () => {
    expect(source).toContain("dbServer.providerReviewDb.getByOrder(orderId)");
    expect(source).toMatch(/dbServer\.providerReviewDb\.getByOrder\(orderId\)[\s\S]*db\.providerReviewDb\.getByOrder\(orderId\)/);
  });
});
