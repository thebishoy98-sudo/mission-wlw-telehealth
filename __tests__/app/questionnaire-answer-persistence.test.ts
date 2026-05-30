import fs from "fs";
import path from "path";

const repoRoot = process.cwd();

describe("Mission questionnaire answer persistence", () => {
  it("persists answers as they change so rapid checkout cannot drop required vitals", () => {
    const source = fs.readFileSync(path.join(repoRoot, "app/start/questionnaire/page.tsx"), "utf8");

    expect(source).toContain("useRef<Record<string, string>>");
    expect(source).toContain("answersRef.current = next");
    expect(source).toContain("saveIntakeState({ questionnaireAnswers: next })");
    expect(source).toContain("const currentAnswers = answersRef.current");
  });

  it("makes the live smoke wait for Mission vitals to be persisted before payment", () => {
    const source = fs.readFileSync(path.join(repoRoot, "scripts/customer-practiceq-smoke.ts"), "utf8");

    expect(source).toContain("waitForMissionQuestionnairePersistence");
    expect(source).toContain("answers.pq_height === expected.pq_height");
    expect(source).toContain("answers.pq_current_weight === expected.pq_current_weight");
    expect(source).toContain("answers.pq_ideal_weight === expected.pq_ideal_weight");
  });
});
