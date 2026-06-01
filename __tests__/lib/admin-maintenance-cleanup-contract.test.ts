import fs from "fs";
import path from "path";

describe("admin maintenance cleanup contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/db.server.ts"), "utf8");

  it("removes old PQ Check launch smoke patients as test data", () => {
    expect(source).toContain("LOWER(first_name) = 'pq'");
    expect(source).toContain("LOWER(last_name) LIKE 'check%'");
    expect(source).toContain("LOWER(email) LIKE 'pq-real-check%@missionwlw.com'");
  });
});
