import fs from "fs";
import path from "path";

const blockedVendorTerms = [
  "PracticeQ",
  "IntakeQ",
  "QuickBooks",
  "LifeFile",
  "AppSheet",
  "Spruce",
];

const surfaces = [
  "app/page.tsx",
  "app/start/confirmation/page.tsx",
  "app/provider/page.tsx",
  "app/provider/patients/[id]/page.tsx",
  "app/api/orders/dispatch/route.ts",
  "app/api/provider/practiceq-files/[fileId]/route.ts",
];

function userVisibleLiterals(relativePath: string, source: string) {
  const lines = source.split(/\r?\n/);
  const visibleLines = relativePath.includes("/api/")
    ? lines.filter((line) => /\berror\s*:|\bdetail\s*:/.test(line))
    : lines.filter((line) => !/^\s*import\b/.test(line));

  return visibleLines.flatMap((line) => line.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? []);
}

describe("customer and provider vendor copy", () => {
  it("does not show implementation vendor names outside admin surfaces", () => {
    const leaks = surfaces.flatMap((relativePath) => {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
      const stringLiterals = userVisibleLiterals(relativePath, source);
      return blockedVendorTerms
        .filter((term) => stringLiterals.some((literal) => literal.toLowerCase().includes(term.toLowerCase())))
        .map((term) => `${relativePath}: ${term}`);
    });

    expect(leaks).toEqual([]);
  });
});
