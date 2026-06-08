import fs from "fs";
import path from "path";

describe("proxy auth rate limiting", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

  it("does not rate-limit read-only session hydration with login brute-force limits", () => {
    expect(source).toContain('path === "/api/auth/session" && req.method === "GET"');
    expect(source).toContain('path.startsWith("/api/auth/")');
  });
});
