import Anthropic from "@anthropic-ai/sdk";
import type { IdentityAiResult, Upload } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

function dataUrlToImageSource(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: match[2],
    },
  };
}

function fallbackResult(summary: string, flags: string[]): IdentityAiResult {
  return {
    status: "needs_review",
    confidence: 0,
    summary,
    flags,
    checkedAt: new Date().toISOString(),
  };
}

export async function verifyIdentityUploads(uploads: Upload[]): Promise<IdentityAiResult> {
  const idUpload = uploads.find((upload) => upload.type === "driver_license");
  const selfieUpload = uploads.find((upload) => upload.type === "selfie_video");

  if (!idUpload || !selfieUpload) {
    return fallbackResult("Identity verification is missing either the ID photo or selfie video.", [
      "missing_required_upload",
    ]);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackResult("AI identity verification is not configured.", ["anthropic_not_configured"]);
  }

  const idImage = dataUrlToImageSource(idUpload.base64Data);
  const selfieFrame = dataUrlToImageSource(selfieUpload.base64Data);
  if (!idImage || !selfieFrame) {
    return fallbackResult("Uploaded identity media could not be read as images for automated comparison.", [
      "unreadable_identity_media",
    ]);
  }

  try {
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Compare the government ID image and selfie frame for identity verification.

Return JSON only:
{
  "status": "verified" | "needs_review" | "rejected",
  "confidence": 0.0 to 1.0,
  "summary": "short provider-facing summary",
  "flags": ["short machine-readable flags"]
}

Use "verified" only when the images are clear and the same person appears to be shown.
Use "needs_review" when quality is poor, the ID is obscured, the match is uncertain, or liveness cannot be assessed.
Use "rejected" only when there is a clear mismatch or obvious invalid document.`,
            },
            idImage,
            selfieFrame,
          ],
        },
      ],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed || !["verified", "needs_review", "rejected"].includes(parsed.status)) {
      return fallbackResult("AI identity verification returned an unreadable response.", [
        "ai_response_parse_failed",
      ]);
    }

    return {
      status: parsed.status,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      summary: String(parsed.summary || "Identity verification completed."),
      flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return fallbackResult("AI identity verification failed and requires manual review.", [
      "ai_identity_error",
      (error as Error).message,
    ]);
  }
}
