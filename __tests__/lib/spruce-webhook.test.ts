/** @jest-environment node */

import crypto from "crypto";
import { parseSpruceWebhookEvent, verifySpruceWebhookSignature } from "@/lib/spruce-webhook";

const inboundEvent = {
  eventTime: "2026-06-29T22:00:00Z",
  object: "event",
  type: "conversationItem.created",
  data: {
    object: {
      id: "ti_inbound_1",
      object: "conversationItem",
      direction: "inbound",
      isInternalNote: false,
      text: "Where is my order?",
      conversationId: "t_1",
      conversation: {
        id: "t_1",
        type: "phone",
        externalParticipants: [
          {
            endpoint: {
              channel: "phone",
              rawValue: "+17328228376",
            },
          },
        ],
      },
    },
  },
};

describe("Spruce webhook parsing", () => {
  it("verifies Spruce's Base64 HMAC-SHA256 signature", () => {
    const body = JSON.stringify(inboundEvent);
    const signature = crypto.createHmac("sha256", "endpoint-secret").update(body).digest("base64");

    expect(verifySpruceWebhookSignature(body, signature, "endpoint-secret")).toBe(true);
    expect(verifySpruceWebhookSignature(body, "invalid", "endpoint-secret")).toBe(false);
  });

  it("extracts an inbound SMS conversation item", () => {
    expect(parseSpruceWebhookEvent(inboundEvent)).toEqual({
      kind: "inbound_message",
      messageId: "ti_inbound_1",
      conversationId: "t_1",
      patientPhone: "+17328228376",
      replyText: "Where is my order?",
    });
  });

  it("ignores outbound items and unrelated events", () => {
    expect(parseSpruceWebhookEvent({
      ...inboundEvent,
      data: { object: { ...inboundEvent.data.object, direction: "outbound" } },
    })).toEqual({ kind: "ignore", reason: "not_inbound" });
    expect(parseSpruceWebhookEvent({ type: "conversation.updated" })).toEqual({
      kind: "ignore",
      reason: "unsupported_event",
    });
  });
});
