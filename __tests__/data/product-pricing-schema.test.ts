import fs from "fs";
import path from "path";

describe("product pricing database schema", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "lib/schema.sql"), "utf8");

  it("stores product starting prices as decimal money values", () => {
    expect(schema).toContain("starting_price   NUMERIC(10,2) NOT NULL");
    expect(schema).toContain("ALTER TABLE products ALTER COLUMN starting_price TYPE NUMERIC(10,2)");
  });
});

