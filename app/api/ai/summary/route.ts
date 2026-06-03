/**
 * AI Provider Chart Summary
 *
 * Generates a concise clinical summary for the provider dashboard.
 * Saves time: provider gets a quick overview before reviewing the full chart.
 *
 * POST /api/ai/summary  { orderId }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as dbServer from "@/lib/db.server";
import { requireProvider } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export async function POST(req: NextRequest) {
  const authError = requireProvider(req);
  if (authError) return authError;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await dbServer.orderDb.getById(orderId).catch(() => null);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const [patient, answers, questions, product] = await Promise.all([
    dbServer.patientDb.getById(order.patientId).catch(() => null),
    dbServer.answerDb.getByOrder(orderId).catch(() => []),
    dbServer.questionDb.getAll().catch(() => []),
    dbServer.productDb.getById(order.productId).catch(() => null),
  ]);
  const dose = (product as any)?.doses?.find((d: { id: string }) => d.id === order.doseId);

  const qaSummary = (answers as any[]).map((a) => {
    const q = (questions as any[]).find((q) => q.id === a.questionId);
    return `- ${q?.text ?? a.questionId}: ${a.answer}`;
  }).join("\n");

  const age = patient
    ? Math.floor((Date.now() - new Date((patient as any).dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : "unknown";

  const prompt = `You are a medical assistant creating a brief chart summary for a physician to review before approving a GLP-1 prescription.

Patient: ${(patient as any)?.firstName} ${(patient as any)?.lastName}, Age ${age}, ${(patient as any)?.gender}
Requested: ${(product as any)?.name} ${(dose as any)?.strength}

Intake Answers:
${qaSummary || "None provided"}

Write a concise clinical summary (3-5 sentences) that:
1. Summarizes relevant medical history
2. Highlights any concerns or noteworthy findings
3. Notes anything the provider should verify before approving
4. Ends with a brief recommendation

Be clinical, neutral, and brief. No disclaimers. No "As an AI..." - just the summary.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    const review = await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null);
    if (review) {
      await dbServer.providerReviewDb.update(review.id, { aiSummary: summary }).catch(() => {});
    }

    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("AI summary error:", err);
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
