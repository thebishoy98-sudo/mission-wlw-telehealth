import { getPublicBaseUrl } from "@/lib/public-url";

describe("getPublicBaseUrl", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses APP_BASE_URL over Render internal localhost request origins", () => {
    process.env = {
      ...originalEnv,
      APP_BASE_URL: "https://mission-wlw-web.onrender.com/",
    };

    expect(getPublicBaseUrl({
      headers: {
        get: (name: string) => name === "host" ? "localhost:10000" : null,
      },
    })).toBe("https://mission-wlw-web.onrender.com");
  });

  it("falls back to forwarded host and proto when no public base env is configured", () => {
    process.env = {
      ...originalEnv,
      APP_BASE_URL: "",
      NEXT_PUBLIC_APP_BASE_URL: "",
      NEXT_PUBLIC_SITE_URL: "",
      RENDER_EXTERNAL_URL: "",
    };

    expect(getPublicBaseUrl({
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-host") return "example.com";
          if (name === "x-forwarded-proto") return "https";
          return null;
        },
      },
    })).toBe("https://example.com");
  });
});
