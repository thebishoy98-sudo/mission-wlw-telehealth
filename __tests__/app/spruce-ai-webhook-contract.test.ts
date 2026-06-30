import fs from "fs";
import path from "path";

describe("Spruce AI production webhook contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/webhooks/spruce/route.ts"), "utf8");

  it("uses the current Spruce event parser and acknowledges before background AI work", () => {
    expect(source).toContain("parseSpruceWebhookEvent");
    expect(source).toContain('parsed.kind !== "inbound_message"');
    expect(source).toContain("after(async () =>");
    expect(source).toContain("processInboundMessage(parsed)");
  });

  it("verifies the registered endpoint signature", () => {
    expect(source).toContain("verifySpruceWebhookSignature");
    expect(source).toContain("SPRUCE_WEBHOOK_SECRET");
    expect(source).toContain('"x-spruce-signature"');
  });

  it("handles opt-out before classification and sends idempotently", () => {
    expect(source.indexOf("isOptOutMessage(event.replyText)")).toBeGreaterThan(-1);
    expect(source.indexOf("await classifySpruceReply")).toBeGreaterThan(
      source.indexOf("isOptOutMessage(event.replyText)")
    );
    expect(source).toContain("`spruce_ai_reply_${event.messageId}`");
    expect(source).toContain("Spruce AI auto-reply sent");
  });
});
