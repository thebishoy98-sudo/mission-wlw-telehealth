/** @jest-environment node */

import { classifySpruceReply } from "@/services/spruce-ai-replies";

describe("classifySpruceReply", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("escalates clinical and medication-safety questions without calling Claude", async () => {
    process.env.SPRUCE_AI_REPLIES = "true";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const createMessage = jest.fn();

    const result = await classifySpruceReply(
      { replyText: "I feel really nauseous after my shot, should I lower my dose?" },
      { createMessage }
    );

    expect(result.decision).toBe("clinical_escalation");
    expect(result.replyText).toContain("clinical team");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns staff review when AI replies are disabled", async () => {
    delete process.env.SPRUCE_AI_REPLIES;

    const result = await classifySpruceReply(
      { replyText: "Where is my package?" },
      { createMessage: jest.fn() }
    );

    expect(result).toMatchObject({
      decision: "staff_review",
      shouldSend: false,
      reason: "spruce_ai_replies_disabled",
    });
  });

  it("parses Claude JSON for a safe operational auto reply", async () => {
    process.env.SPRUCE_AI_REPLIES = "true";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const result = await classifySpruceReply(
      {
        replyText: "Can you send my tracking link?",
        orderStatus: "shipped",
        pharmacyStatus: "shipped",
      },
      {
        createMessage: jest.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                decision: "auto_reply",
                confidence: 0.91,
                replyText: "Your order has shipped. Please check the tracking link we texted you earlier.",
                reason: "Shipping question with known shipped status.",
              }),
            },
          ],
        }),
      }
    );

    expect(result).toMatchObject({
      decision: "auto_reply",
      shouldSend: true,
    });
    expect(result.replyText).toContain("shipped");
  });

  it("clamps overly long Claude replies", async () => {
    process.env.SPRUCE_AI_REPLIES = "true";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const longReply = "A".repeat(900);

    const result = await classifySpruceReply(
      { replyText: "What happens next?" },
      {
        createMessage: jest.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({ decision: "auto_reply", replyText: longReply }) }],
        }),
      }
    );

    expect(result.replyText.length).toBeLessThanOrEqual(480);
  });
});
