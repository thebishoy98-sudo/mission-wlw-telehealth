import { seedQuestions } from "@/data/seed-data";

describe("Mission questionnaire options", () => {
  it("lets patients answer that no listed PracticeQ conditions apply", () => {
    const conditions = seedQuestions.find((question) => question.id === "pq_conditions");

    expect(conditions?.options).toContain("None apply to me");
  });

  it("removes broad surgical history and only keeps the gastric bypass blocker", () => {
    const surgicalHistory = seedQuestions.find((question) => question.id === "pq_surgical_history");
    const gastricBypass = seedQuestions.find((question) => question.id === "pq_gastric_bypass");

    expect(surgicalHistory).toBeUndefined();
    expect(gastricBypass).toMatchObject({
      type: "radio",
      required: true,
      options: ["Yes", "No"],
      disqualifying: "Yes",
    });
  });

  it("asks only about known allergies to the requested medication or ingredients", () => {
    const medicationAllergies = seedQuestions.find((question) => question.id === "pq_medication_allergies");

    expect(medicationAllergies).toMatchObject({
      type: "radio",
      required: true,
      options: ["No", "Yes"],
      text: "Do you have a known allergy to the medication you're requesting or any of its ingredients?",
    });
    expect(medicationAllergies?.disqualifying).toBeUndefined();
  });
});
