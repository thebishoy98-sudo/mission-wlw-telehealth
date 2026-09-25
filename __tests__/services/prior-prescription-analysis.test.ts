/** @jest-environment node */
import { analyzePriorPrescription, parsePrescriptionAnalysis } from "@/services/prior-prescription-analysis";
const valid = { readable: true, confidence: 0.99, flags: [], facts: { patientName: "Jane Smith", medication: "Example medication", directions: "Use as printed", prescribedDate: "2026-09-01", prescriber: "Dr Example" } };
test("clear extraction remains document analysis, never approval", () => {
  const result = parsePrescriptionAnalysis(JSON.stringify(valid), "Jane Smith");
  expect(result.status).toBe("clear_document");
  expect(result).not.toHaveProperty("approved");
});
test("high confidence cannot override mismatched patient", () => {
  expect(parsePrescriptionAnalysis(JSON.stringify(valid), "Other Patient").status).toBe("needs_review");
});
test.each([
  { ...valid, confidence: "0.99" }, { ...valid, confidence: 1.5 },
  { ...valid, readable: false }, { ...valid, flags: ["uncertain"] },
  { ...valid, facts: { ...valid.facts, directions: null } }, { ...valid, confidence: 0.7 },
])("uncertain or invalid extraction requires review", input => {
  expect(parsePrescriptionAnalysis(JSON.stringify(input), "Jane Smith").status).toBe("needs_review");
});
test("malformed model response fails closed", () => {
  expect(parsePrescriptionAnalysis("approved", "Jane Smith").status).toBe("needs_review");
});
test("unsupported documents return manual review without contacting the API", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-only";
  try { expect((await analyzePriorPrescription("data:application/pdf;base64,AAAA", "Jane Smith")).status).toBe("needs_review"); }
  finally { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous; }
});
