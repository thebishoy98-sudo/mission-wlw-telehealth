import config from "../next.config";

describe("marketing vanity redirects", () => {
  it("connects public marketing paths to live app destinations", async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/weight-loss-program", destination: "/products", permanent: false },
        { source: "/pricing", destination: "/#pricing", permanent: false },
        { source: "/support", destination: "/#faq", permanent: false },
      ])
    );
  });
});
