const appSettingGet = jest.fn();
const appSettingSet = jest.fn();

jest.mock("@/lib/db.server", () => ({
  appSettingDb: {
    get: appSettingGet,
    set: appSettingSet,
  },
}));

describe("getQBAccessToken", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    appSettingGet.mockReset();
    appSettingSet.mockReset();
    appSettingSet.mockImplementation(async (_key, value) => value);
    process.env = {
      ...originalEnv,
      QB_CLIENT_ID: "client-id",
      QB_CLIENT_SECRET: "client-secret",
      QB_REFRESH_TOKEN: "env-refresh-token",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses the stored refresh token, persists rotations, and reuses a valid access token", async () => {
    appSettingGet.mockResolvedValue("stored-refresh-token");
    const fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("refresh_token")).toBe("stored-refresh-token");
      return {
        ok: true,
        json: async () => ({
          access_token: "access-token-1",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600,
        }),
      } as Response;
    });
    global.fetch = fetchMock as any;

    const { getQBAccessToken } = await import("@/lib/qb-oauth");

    await expect(getQBAccessToken()).resolves.toBe("access-token-1");
    await expect(getQBAccessToken()).resolves.toBe("access-token-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(appSettingSet).toHaveBeenCalledWith("quickbooks_refresh_token", "rotated-refresh-token");
  });
});
