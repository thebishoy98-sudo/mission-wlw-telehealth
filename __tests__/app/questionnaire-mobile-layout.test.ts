import fs from "fs";
import path from "path";

describe("questionnaire mobile layout", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/start/questionnaire/page.tsx"), "utf8");

  it("keeps the navigation buttons inside the phone viewport", () => {
    expect(source).toContain('className="flex w-full min-w-0 gap-3"');
    expect(source).toContain('className="w-24 shrink-0 sm:w-28"');
    expect(source).toContain('className="min-w-0 flex-1"');
    expect(source).not.toContain("<Button fullWidth type=\"button\" onClick={handleNext}>");
  });
});
