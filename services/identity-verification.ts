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

interface IdentityVerificationContext {
  patientName?: string;
  dateOfBirth?: string;
}

export async function verifyIdentityUploads(
  uploads: Upload[],
  context: IdentityVerificationContext = {}
): Promise<IdentityAiResult> {
  const idUpload = uploads.find((upload) => upload.type === "driver_license");
  const selfieUpload = uploads.find((upload) => upload.type === "selfie_video");

  if (!idUpload || !selfieUpload) {
    return fallbackResult("Identity verification is missing either the ID photo or identity video.", [
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
              text: `Compare the government ID image and identity video frame for identity verification.

Expected order identity:
- Patient name: ${context.patientName || "unknown"}
- Date of birth: ${context.dateOfBirth || "unknown"}

Return JSON only:
{
  "status": "verified" | "needs_review" | "rejected",
  "confidence": 0.0 to 1.0,
  "summary": "one short provider-facing sentence",
  "flags": ["short machine-readable flags"]
}

Check all of these:
1. The ID appears to be a real government ID, not a screen/photo of a screen.
2. The face on the ID appears to match the person in the identity video frame.
3. The full name extracted from the ID matches the expected order name.
4. The date of birth extracted from the ID matches the expected order date of birth.

Use "verified" only when the ID is readable, the face match is clear, and name/DOB match the order.
Use "needs_review" when image quality, ID readability, name, DOB, or face match is uncertain.
Use "rejected" only when there is a clear mismatch, obvious fake/invalid document, or clear name/DOB mismatch.
Keep the summary brief and avoid listing implementation details.`,
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
