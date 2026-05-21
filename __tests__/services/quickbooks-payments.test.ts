describe("quickbooks-payments.chargeCard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
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
});
