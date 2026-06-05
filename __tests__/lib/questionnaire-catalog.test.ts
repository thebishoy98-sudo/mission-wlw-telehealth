import { ensurePracticeQRequiredQuestions } from "@/lib/questionnaire-catalog";
import type { Question } from "@/types";

describe("ensurePracticeQRequiredQuestions", () => {
  it("keeps PracticeQ vitals in the catalog even when the database already has custom questions", () => {
    const dbQuestions: Question[] = [
      {
        id: "custom_allergy",
        category: "allergies",
        text: "Any Allergies to medication?",
        type: "radio",
        options: ["No", "Yes"],
        required: true,
        displayOrder: 1,
      },
    ];

    const merged = ensurePracticeQRequiredQuestions(dbQuestions);

    expect(merged.map((question) => question.id)).toEqual([
      "pq_height",
      "pq_current_weight",
      "pq_ideal_weight",
      "pq_conditions",
      "pq_surgical_history",
      "custom_allergy",
      "pq_intake_purpose",
      "pq_gastric_bypass",
    ]);
  });

  it("does not duplicate required PracticeQ questions already present by text", () => {
    const dbQuestions: Question[] = [
      {
        id: "height_from_db",
        category: "screening",
        text: "What is your height?",
        type: "text",
        required: true,
        displayOrder: 1,
      },
    ];

    const merged = ensurePracticeQRequiredQuestions(dbQuestions);

    expect(merged.filter((question) => question.text === "What is your height?")).toHaveLength(1);
    expect(merged[0].id).toBe("height_from_db");
  });
});
