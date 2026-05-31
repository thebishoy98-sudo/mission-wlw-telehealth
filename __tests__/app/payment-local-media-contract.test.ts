import fs from "fs";
import path from "path";

describe("payment local identity draft", () => {
  it("keeps the local browser draft small by preferring the selfie frame over the full video", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");

    expect(source).toContain("const identityData = intakeState.selfieFrameData || intakeState.identityVideoData || \"\";");
    expect(source).not.toContain("const identityData = intakeState.identityVideoData || intakeState.selfieFrameData || \"\";");
  });
});
