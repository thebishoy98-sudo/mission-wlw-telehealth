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
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

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
  const product = db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  const qaSummary = answers.map((a) => {
    const q = questions.find((q) => q.id === a.questionId);
    return `- ${q?.text ?? a.questionId}: ${a.answer}`;
  }).join("\n");

  const age = patient
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : "unknown";

  const prompt = `You are a medical assistant creating a brief chart summary for a physician to review before approving a GLP-1 prescription.

Patient: ${patient?.firstName} ${patient?.lastName}, Age ${age}, ${patient?.gender}
Requested: ${product?.name} ${dose?.strength}

Intake Answers:
${qaSummary || "None provided"}

Write a concise clinical summary (3-5 sentences) that:
1. Summarizes relevant medical history
2. Highlights any concerns or noteworthy findings
3. Notes anything the provider should verify before approving
4. Ends with a brief recommendation

Be clinical, neutral, and brief. No disclaimers. No "As an AI..." — just the summary.`;

  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const summary = message.content[0].type === "text" ? message.content[0].text.trim() : "";

  // Save to provider review
  const review = db.providerReviewDb.getByOrder(orderId);
  if (review) {
    await dbServer.providerReviewDb.update(review.id, { aiSummary: summary }).catch(() => {});
  }

  return NextResponse.json({ summary });
}
