import { seedQuestions } from "@/data/seed-data";

describe("Mission questionnaire options", () => {
  it("lets patients answer that no listed PracticeQ conditions apply", () => {
    const conditions = seedQuestions.find((question) => question.id === "pq_conditions");

    expect(conditions?.options).toContain("None apply to me");
  });

  it("requires explicit yes/no answers for PracticeQ required medical prompts", () => {
    const surgicalHistory = seedQuestions.find((question) => question.id === "pq_surgical_history");
    const medicationAllergies = seedQuestions.find((question) => question.id === "pq_medication_allergies");

    expect(surgicalHistory).toMatchObject({ type: "radio", required: true, options: ["No", "Yes"] });
    expect(medicationAllergies).toMatchObject({ type: "radio", required: true, options: ["No", "Yes"] });
  });
});
