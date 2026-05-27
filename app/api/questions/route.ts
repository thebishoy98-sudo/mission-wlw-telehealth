import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { seedQuestions } from "@/data/seed-data";
import { getPracticeQQuestionnaire } from "@/services/practiceq";

export const dynamic = "force-dynamic";

export async function GET() {
  // Option B: serve PracticeQ's own questionnaire questions so that question IDs
  // on the website match PracticeQ question IDs exactly — no fuzzy matching on submit.
  const pqQuestions = await getPracticeQQuestionnaire().catch(() => null);
  if (pqQuestions && pqQuestions.length > 0) {
    return NextResponse.json({ questions: pqQuestions, source: "practiceq" });
  }

  // Fallback: DB → local → seed
  const questions = await dbServer.questionDb.getAll().catch(() => []);
  const localQuestions = db.questionDb.getAll();
  return NextResponse.json({
    questions: questions.length ? questions : (localQuestions.length ? localQuestions : seedQuestions),
  });
}
