const getQBAccessToken = jest.fn(async () => "qb-access-token");

jest.mock("@/lib/qb-oauth", () => ({
  getQBAccessToken,
}));

describe("quickbooks-payments.chargeCard", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    getQBAccessToken.mockClear();
    process.env = {
      ...originalEnv,
      USE_REAL_QUICKBOOKS: "false",
      QB_CLIENT_ID: "configured-client-id",
      QB_CLIENT_SECRET: "configured-client-secret",
      QB_REFRESH_TOKEN: "invalid-refresh-token",
      QB_REALM_ID: "configured-realm",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("uses mock mode when QuickBooks is disabled even if QB credentials exist", async () => {
    const qbPayments = await import("@/services/quickbooks-payments");

    const result = await qbPayments.chargeCard("order-1", "patient-1", 299, {
      cardLast4: "5151",
      cardBrand: "visa",
    });

    expect(result.chargeId).toMatch(/^qbp_mock_/);
    expect(result.status).toBe("CAPTURED");
    expect(result.cardLast4).toBe("5151");
  });

  it("normalizes USA billing addresses to QuickBooks Payments country code US", async () => {
    process.env = {
      ...process.env,
      USE_REAL_QUICKBOOKS: "true",
      QB_ALLOW_RAW_CARD_CHARGES: "true",
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        id: "charge_1",
        status: "CAPTURED",
        amount: "0.01",
        currency: "USD",
        card: { number: "xxxxxxxxxxxx4242", cardType: "Visa" },
        created: "2026-05-29T00:00:00Z",
        updated: "2026-05-29T00:00:00Z",
      }),
    } as Response));
    global.fetch = fetchMock as any;

    const qbPayments = await import("@/services/quickbooks-payments");

    await qbPayments.chargeCard("order-1", "patient-1", 0.01, {
      cardNumber: "4111111111111111",
      expMonth: "12",
      expYear: "2030",
      cvc: "123",
      cardName: "Test Patient",
      billingAddress: {
        street1: "123 Main St",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        country: "USA",
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.card.address.country).toBe("US");
  });
});
