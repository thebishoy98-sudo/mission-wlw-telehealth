import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { seedQuestions } from "@/data/seed-data";
import { ensurePracticeQRequiredQuestions } from "@/lib/questionnaire-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const questions = await dbServer.questionDb.getAll().catch(() => []);
  const localQuestions = db.questionDb.getAll();
  return NextResponse.json({
    questions: ensurePracticeQRequiredQuestions(questions.length ? questions : (localQuestions.length ? localQuestions : seedQuestions)),
  });
}
