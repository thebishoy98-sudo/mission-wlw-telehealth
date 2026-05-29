import * as db from "@/lib/db";
import { tirzepatideProduct } from "@/data/products";
import type { Order } from "@/types";

const seed = (doseId = "tirzepatide_20mg_8_week"): Order => {
  db.clearAllData();
  db.patientDb.create({
    id: "p1",
    firstName: "Bishoy",
    lastName: "Kamel",
    dateOfBirth: "1998-04-14",
    gender: "male",
    phone: "7328228376",
    email: "bishoy@example.com",
    address: { street1: "3319 Davisson Ave", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
    shippingAddress: { street1: "3319 Davisson Ave", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.productDb.create(tirzepatideProduct);
  return db.orderDb.create({
    id: `order_${doseId}`,
    patientId: "p1",
    productId: tirzepatideProduct.id,
    doseId,
    status: "approved",
    paymentStatus: "completed",
    pharmacyStatus: "draft",
    practiceQStatus: "completed",
    quickbooksStatus: "skipped",
    identityStatus: "verified",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
};

describe("appsheet pharmacy integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.USE_REAL_APPSHEET = "false";
    if (!global.fetch) {
      Object.defineProperty(global, "fetch", {
        value: jest.fn(),
        configurable: true,
        writable: true,
      });
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("maps Tirzepatide 20mg orders to the 1 mL AppSheet item plus supplies without live API calls", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const order = seed("tirzepatide_20mg_8_week");
    const appsheet = await import("@/services/appsheet");

    const pharmacyOrder = await appsheet.createPharmacyOrder(order);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pharmacyOrder.status).toBe("submitted");
    expect(pharmacyOrder.lifeFileOrderId).toMatch(/^AS_MOCK_/);
    expect(pharmacyOrder.payload.order.rxs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drugName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (1 ML)",
          drugStrength: "8279095",
          quantity: 1,
          directions: "Inject 12.5 units (2.5mg) SbQ weekly.",
        }),
        expect.objectContaining({ drugName: "COMFORT EZ 31GX5/16\" 1ML", drugStrength: "8005858" }),
        expect.objectContaining({ drugName: "ALCOHOL SWABS", drugStrength: "6850497" }),
      ])
    );
    expect(db.integrationLogDb.getAll().find((log) => log.integrationName === "appsheet")).toMatchObject({
      status: "success",
      action: "AppSheet pharmacy order created (mock)",
    });
  });

  it("splits Tirzepatide 60mg orders across 2 mL and 1 mL AppSheet vial items", async () => {
    const order = seed("tirzepatide_60mg_8_week");
    const appsheet = await import("@/services/appsheet");

    const pharmacyOrder = await appsheet.createPharmacyOrder(order);

    expect(pharmacyOrder.payload.order.rxs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drugName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (2 ML)",
          drugStrength: "8279096",
          quantity: 1,
        }),
        expect.objectContaining({
          drugName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (1 ML)",
          drugStrength: "8279095",
          quantity: 1,
        }),
      ])
    );
  });

  it("builds the AppSheet Add action only when real AppSheet mode is explicitly enabled", async () => {
    process.env.USE_REAL_APPSHEET = "true";
    process.env.APPSHEET_ID = "app_123";
    process.env.APPSHEET_API_KEY = "key_123";
    process.env.APPSHEET_ORDER_TABLE = "OrderItems";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ Rows: [{ "Order ID": "order_tirzepatide_40mg_8_week" }] }),
    } as Response);
    const order = seed("tirzepatide_40mg_8_week");
    const appsheet = await import("@/services/appsheet");

    await appsheet.createPharmacyOrder(order);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/v2/apps/app_123/tables/Client/Action");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/v2/apps/app_123/tables/PharmacyOrder/Action");
    const [url, init] = fetchSpy.mock.calls[2];
    expect(String(url)).toContain("/api/v2/apps/app_123/tables/OrderItems/Action");
    expect(String(url)).toContain("applicationAccessKey=");
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      Action: "Add",
      Rows: expect.arrayContaining([
        expect.objectContaining({
          ID: order.id,
          Client_Order_Status: "New",
        }),
      ]),
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toMatchObject({
      Action: "Add",
      Rows: expect.arrayContaining([
        expect.objectContaining({
          ID: `AS_${order.id}`,
          Client: order.id,
          Status: "Order",
          Pharmacy: "1stChoiceRx",
        }),
      ]),
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      Action: "Add",
      Properties: { Locale: "en-US", Timezone: "America/New_York" },
      Rows: expect.arrayContaining([
        expect.objectContaining({
          "Client Order ID": `AS_${order.id}`,
          "Pharmacy Order Id": order.id,
          lfProductID: "8279096",
          lfProduct_ID: "8279096",
          drugName: "TIRZEPATIDE/PYRIDOXINE",
          drugStrength: "20MG/25MG/ML (2 ML)",
          quantity: "1",
        }),
      ]),
    });
  });
});
