/**
 * AI Patient Chat Assistant
 *
 * Answers patient questions about GLP-1 therapy, their order, and the program.
 * Streams responses for a real-time chat feel.
 *
 * POST /api/ai/chat  { message, conversationId?, patientId?, orderId? }
 *
 * The assistant:
 *   - Answers general GLP-1 / weight management questions
 *   - Explains order status and next steps
 *   - Directs clinical questions to the provider
 *   - Never gives specific medical advice or dosage changes
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const SYSTEM_PROMPT = `You are a helpful patient support assistant for Mission Wellness & Weight Loss (Mission WLW), a telehealth platform specializing in GLP-1 weight management therapy.

Your role:
- Answer questions about GLP-1 medications (Tirzepatide, Semaglutide) in plain language
- Explain the Mission WLW program, ordering process, and what to expect
- Provide general wellness support and encouragement
- Explain order status and next steps clearly

You MUST:
- Be warm, supportive, and encouraging
- Direct any specific dosage, side effect severity, or clinical questions to "your provider or our clinical team"
- Never suggest changing doses or medications
- Keep responses concise (2-4 sentences unless more detail is needed)
- If asked about something outside your scope, say "That's a great question for your provider - you can message them directly through your patient dashboard"

You must NOT:
- Diagnose conditions
- Recommend specific dosages or medication changes
- Give advice that contradicts provider instructions
- Make promises about outcomes or timelines`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { message, conversationId, patientId, orderId } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Load or create conversation
  let conversation = conversationId
    ? await dbServer.aiConversationDb.get(conversationId).catch(() => null)
    : null;

  const convId = conversationId ?? generateId();
  const history: Array<{ role: "user" | "assistant"; content: string }> =
    conversation?.messages ?? [];

  // Add context about the patient's order if available
  let contextPrefix = "";
  if (orderId) {
    const order = db.orderDb.getById(orderId);
    if (order) {
      const statusLabels: Record<string, string> = {
        draft: "incomplete",
        pending_review: "under review",
        approved: "approved",
        sent_to_pharmacy: "sent to pharmacy",
        processing: "being prepared at the pharmacy",
        shipped: "shipped",
        delivered: "delivered",
      };
      contextPrefix = `[Context: Patient's order is currently ${statusLabels[order.status] ?? order.status}. Pharmacy status: ${order.pharmacyStatus}.]`;
    }
  }

  const userMessage = contextPrefix ? `${contextPrefix}\n\nPatient: ${message}` : message;

  // Build message history for Claude
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-10), // keep last 10 turns for context
    { role: "user", content: userMessage },
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // fast model for chat
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    });

    const assistantMessage = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "I'm sorry, I couldn't process that. Please try again.";

    // Persist conversation
    const newHistory = [
      ...history,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: assistantMessage },
    ];

    if (!conversation) {
      await dbServer.aiConversationDb.create({
        id: convId, patientId, orderId, role: "patient", messages: newHistory,
      }).catch(() => {});
    } else {
      await dbServer.aiConversationDb.appendMessage(convId, { role: "user", content: message }).catch(() => {});
      await dbServer.aiConversationDb.appendMessage(convId, { role: "assistant", content: assistantMessage }).catch(() => {});
    }

    return NextResponse.json({
      reply: assistantMessage,
      conversationId: convId,
    });
  } catch (err: any) {
    console.error("AI chat error:", err);
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
