import fs from "fs";
import path from "path";

describe("Spruce AI webhook contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/webhooks/spruce/route.ts"), "utf8");

  it("wires inbound Spruce replies to the hybrid AI classifier and outbound sender", () => {
    expect(source).toContain("classifySpruceReply");
    expect(source).toContain("sendTextToPhone");
    expect(source).toContain("Spruce AI auto-reply sent");
    expect(source).toContain("Spruce AI reply escalated");
  });

  it("keeps opt-out handling before AI reply automation", () => {
    const aiCall = "const aiReply = await classifySpruceReply";
    expect(source.indexOf("isOptOutMessage(replyText)")).toBeGreaterThan(-1);
    expect(source.indexOf(aiCall)).toBeGreaterThan(-1);
    expect(source.indexOf("isOptOutMessage(replyText)")).toBeLessThan(source.indexOf(aiCall));
  });
});
