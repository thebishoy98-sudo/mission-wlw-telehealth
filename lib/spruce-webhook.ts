import crypto from "crypto";

export type ParsedSpruceWebhook =
  | {
      kind: "inbound_message";
      messageId: string;
      conversationId: string;
      patientPhone: string;
      replyText: string;
    }
  | { kind: "ignore"; reason: string };

export function verifySpruceWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(body).digest();
    const provided = Buffer.from(signature, "base64");
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function parseSpruceWebhookEvent(payload: any): ParsedSpruceWebhook {
  if (payload?.type !== "conversationItem.created") {
    return { kind: "ignore", reason: "unsupported_event" };
  }

  const item = payload?.data?.object;
  if (!item || item.object !== "conversationItem") {
    return { kind: "ignore", reason: "invalid_conversation_item" };
  }
  if (item.direction !== "inbound" || item.isInternalNote === true) {
    return { kind: "ignore", reason: "not_inbound" };
  }

  const replyText = String(item.text ?? "").trim();
  if (!replyText) return { kind: "ignore", reason: "empty_message" };

  const conversation = item.conversation ?? {};
  const participant = Array.isArray(conversation.externalParticipants)
    ? conversation.externalParticipants.find((entry: any) => {
        const endpoint = entry?.endpoint ?? entry;
        return (
          endpoint?.channel === "phone" ||
          endpoint?.channelType === "phone" ||
          endpoint?.type === "phone"
        );
      })
    : null;
  const endpoint = participant?.endpoint ?? participant;

  return {
    kind: "inbound_message",
    messageId: String(item.id ?? ""),
    conversationId: String(item.conversationId ?? conversation.id ?? ""),
    patientPhone: String(
      endpoint?.rawValue ?? endpoint?.value ?? endpoint?.phoneNumber ?? ""
    ),
    replyText,
  };
}
