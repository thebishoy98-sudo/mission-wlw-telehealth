import { seedQuestions } from "@/data/seed-data";

describe("Mission questionnaire options", () => {
  it("lets patients answer that no listed PracticeQ conditions apply", () => {
    const conditions = seedQuestions.find((question) => question.id === "pq_conditions");

    expect(conditions?.options).toContain("None apply to me");
  });
});
