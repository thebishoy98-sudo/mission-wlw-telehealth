import { dataUrlToFileParts } from "@/lib/data-url";

describe("dataUrlToFileParts", () => {
  it("preserves video/mp4 metadata instead of relabeling it as webm", () => {
    const result = dataUrlToFileParts("data:video/mp4;base64,AAAA", "identity-video");

    expect(result.mimeType).toBe("video/mp4");
    expect(result.extension).toBe("mp4");
    expect(result.filename).toBe("identity-video.mp4");
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("uses jpeg metadata for captured still frames", () => {
    const result = dataUrlToFileParts("data:image/jpeg;base64,/9j/AA==", "identity-frame");

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
    expect(result.filename).toBe("identity-frame.jpg");
  });
});
