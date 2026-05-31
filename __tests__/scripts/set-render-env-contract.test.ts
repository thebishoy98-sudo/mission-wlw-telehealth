import { readFileSync } from "fs";
import path from "path";

describe("set-render-env script", () => {
  const source = readFileSync(path.join(process.cwd(), "scripts", "set-render-env.ts"), "utf8");

  it("reads existing Render env vars before writing the merged payload", () => {
    expect(source).toContain("async function getEnvVars");
    expect(source).toContain("await getEnvVars(serviceId)");
    expect(source).toContain("mergedEnvVars");
  });
});
