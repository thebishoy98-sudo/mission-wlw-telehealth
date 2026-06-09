import { ensurePracticeQRequiredQuestions } from "@/lib/questionnaire-catalog";
import type { Question } from "@/types";

describe("ensurePracticeQRequiredQuestions", () => {
  it("keeps PracticeQ vitals in the catalog even when the database already has custom questions", () => {
    const dbQuestions: Question[] = [
      {
        id: "custom_allergy",
        category: "allergies",
        text: "Do you have a known allergy to the medication you're requesting or any of its ingredients?",
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

  it("does not re-add stale database rows for removed or renamed required questions", () => {
    const dbQuestions: Question[] = [
      {
        id: "pq_surgical_history",
        category: "screening",
        text: "Any surgical history?",
        type: "radio",
        options: ["No", "Yes"],
        required: true,
        displayOrder: 5,
      },
      {
        id: "pq_medication_allergies",
        category: "allergies",
        text: "Any Allergies to medication?",
        type: "radio",
        options: ["No", "Yes"],
        required: true,
        displayOrder: 6,
      },
    ];

    const merged = ensurePracticeQRequiredQuestions(dbQuestions);

    expect(merged.find((question) => question.id === "pq_surgical_history")).toBeUndefined();
    expect(merged.find((question) => question.text === "Any Allergies to medication?")).toBeUndefined();
    expect(merged.find((question) => question.id === "pq_medication_allergies")?.text).toBe(
      "Do you have a known allergy to the medication you're requesting or any of its ingredients?"
    );
  });
});
