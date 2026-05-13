/**
 * AI Eligibility Pre-Screen
 *
 * Runs before the provider sees an order. Uses Claude to:
 *   1. Analyze questionnaire answers for red flags beyond hard disqualifiers
 *   2. Flag any concerns for provider attention
 *   3. Generate a confidence score
 *
 * Called automatically when a patient completes the intake.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = db.orderDb.getById(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const patient = db.patientDb.getById(order.patientId);
  const answers = db.answerDb.getByOrder(orderId);
  const questions = db.questionDb.getAll();

  // Build questionnaire summary for Claude
  const qaSummary = answers.map((a) => {
    const q = questions.find((q) => q.id === a.questionId);
    return `Q: ${q?.text ?? a.questionId}\nA: ${a.answer}`;
  }).join("\n\n");

  const patientAge = patient
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : "unknown";

  const prompt = `You are a medical intake screener for a GLP-1 weight management telehealth platform.

Review the following patient intake questionnaire and provide a clinical pre-screen assessment.

Patient: ${patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"}, Age: ${patientAge}, Gender: ${patient?.gender ?? "unknown"}

Questionnaire Answers:
${qaSummary || "No answers provided"}

Provide your assessment in the following JSON format only (no other text):
{
  "eligible": true or false,
  "confidenceScore": 0.0 to 1.0,
  "flags": ["list of clinical concerns or items needing provider attention"],
  "summary": "2-3 sentence clinical summary for the provider",
  "recommendation": "approve" | "review" | "reject"
}

Base your assessment on:
- Contraindications for GLP-1 therapy (thyroid cancer, MEN2, pancreatitis history, etc.)
- Drug interactions with current medications
- Cardiovascular risk factors
- Appropriateness for weight management therapy
- Any answers that warrant follow-up questions

Be conservative — flag anything that warrants provider attention.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";

    let assessment: any;
    try {
      // Extract JSON from response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      assessment = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      assessment = null;
    }

    if (!assessment) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Update provider review with AI findings
    const review = db.providerReviewDb.getByOrder(orderId);
    if (review) {
      db.providerReviewDb.update(review.id, {
        notes: `[AI Pre-Screen] ${assessment.summary}`,
      } as any);
      await dbServer.providerReviewDb.update(review.id, {
        aiSummary: assessment.summary,
        aiFlags: assessment.flags,
      }).catch(() => {});
    }

    // Log
    const logEntry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "system" as const,
      action: "AI eligibility pre-screen completed",
      orderId, patientId: order.patientId, status: "success" as const,
      details: { recommendation: assessment.recommendation, flagCount: assessment.flags?.length ?? 0 },
    };
    db.integrationLogDb.create(logEntry);
    await dbServer.integrationLogDb.create(logEntry).catch(() => {});

    return NextResponse.json(assessment);
  } catch (err: any) {
    console.error("AI eligibility error:", err);
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
