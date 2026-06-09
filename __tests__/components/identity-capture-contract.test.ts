import fs from "fs";
import path from "path";

describe("IdentityCapture media contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/identity/IdentityCapture.tsx"), "utf8");

  it("records identity video with microphone audio", () => {
    const constraintsBlock = source.match(/const identityVideoConstraints: MediaStreamConstraints = \{[\s\S]*?\n\};/)?.[0] ?? "";

    expect(constraintsBlock).toContain("audio:");
    expect(constraintsBlock).not.toContain("audio: false");
  });

  it("uses an audio-capable MediaRecorder type for webm recordings", () => {
    expect(source).toContain("video/webm;codecs=vp8,opus");
  });
});
