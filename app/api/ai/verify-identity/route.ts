/**
 * AI Identity Verification
 *
 * Accepts a base64 government ID photo and a base64 selfie image/frame.
 * Sends both to Claude vision to determine if they show the same person.
 *
 * Outcomes:
 *   verified      - clearly the same person
 *   needs_review  - uncertain, route to manual review
 *   rejected      - clearly different people or unusable images
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as db from "@/lib/db";
import { logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

function stripPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
}

function getMediaType(
  dataUrl: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/);
  const type = match?.[1] ?? "image/jpeg";
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  return (allowed.includes(type) ? type : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { idPhotoBase64, selfieBase64, orderId } = await req.json();

  if (!idPhotoBase64 || !selfieBase64) {
    return NextResponse.json(
      { error: "idPhotoBase64 and selfieBase64 are required" },
      { status: 400 }
    );
  }

  // HIPAA audit
  if (orderId) {
    const order = db.orderDb.getById(orderId);
    if (order) {
      const ctx = actorFromHeaders(req.headers);
      logPhiDisclosure(order.patientId, orderId, "anthropic", ctx.actor ?? "system");
    }
  }

  const idMediaType = getMediaType(idPhotoBase64);
  const selfieMediaType = getMediaType(selfieBase64);

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an identity verification assistant for a healthcare telehealth platform. Your job is to compare the face in the first image (a government-issued photo ID) with the face in the second image (a patient selfie).

Analyze:
1. Facial structure, features, and overall resemblance
2. Skin tone, eye shape, nose, jawline consistency
3. Any signs of tampering, mismatch, or image quality issues

Respond ONLY with valid JSON - no other text:
{
  "verdict": "verified" | "needs_review" | "rejected",
  "confidence": 0.0 to 1.0,
  "summary": "1-2 sentence explanation",
  "flags": ["list any concerns - empty array if none"]
}

Rules:
- "verified": clearly the same person, confidence >= 0.80
- "needs_review": uncertain match, unclear images, or confidence < 0.80
- "rejected": clearly different people

Be conservative - if uncertain, use "needs_review" rather than "verified".`,
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: idMediaType,
                data: stripPrefix(idPhotoBase64),
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: selfieMediaType,
                data: stripPrefix(selfieBase64),
              },
            },
          ],
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const result = JSON.parse(jsonMatch[0]) as {
      verdict: "verified" | "needs_review" | "rejected";
      confidence: number;
      summary: string;
      flags: string[];
    };

    // Update order in localStorage if orderId provided
    if (orderId) {
      db.orderDb.update(orderId, {
        identityStatus: result.verdict,
        identityReason: result.summary,
        identityAiResult: result,
      } as any);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Identity verification error:", err);
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
