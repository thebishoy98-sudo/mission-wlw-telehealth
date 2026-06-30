/** @jest-environment node */

import { classifySpruceReply } from "@/services/spruce-ai-replies";

describe("classifySpruceReply", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SPRUCE_AI_REPLIES: "true", ANTHROPIC_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("escalates clinical questions without calling Claude", async () => {
    const createMessage = jest.fn();
    const result = await classifySpruceReply(
      { replyText: "I feel nauseous after my shot, should I lower my dose?" },
      { createMessage }
    );
    expect(result).toMatchObject({ decision: "clinical_escalation", shouldSend: true });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns staff review when AI replies are disabled", async () => {
    delete process.env.SPRUCE_AI_REPLIES;
    await expect(classifySpruceReply(
      { replyText: "Where is my package?" },
      { createMessage: jest.fn() }
    )).resolves.toMatchObject({
      decision: "staff_review",
      shouldSend: false,
      reason: "spruce_ai_replies_disabled",
    });
  });

  it("parses a safe operational Claude reply", async () => {
    const result = await classifySpruceReply(
      { replyText: "Can you send my tracking link?", orderStatus: "shipped" },
      {
        createMessage: jest.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({
            decision: "auto_reply",
            confidence: 0.95,
            replyText: "Your order has shipped. Please use the tracking link we sent earlier.",
            reason: "Operational shipping question",
          }) }],
        }),
      }
    );
    expect(result).toMatchObject({ decision: "auto_reply", shouldSend: true });
  });
});
