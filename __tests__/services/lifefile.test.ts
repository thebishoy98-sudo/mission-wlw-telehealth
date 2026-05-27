import * as lifefile from "@/services/lifefile";
import * as db from "@/lib/db";
import { tirzepatideProduct } from "@/data/products";

const seed = () => {
  db.patientDb.create({
    id: "p1",
    firstName: "Carol",
    lastName: "White",
    dateOfBirth: "1978-03-22",
    gender: "female",
    phone: "5550001111",
    email: "carol@example.com",
    address: { street1: "789 Elm", city: "Austin", state: "TX", zipCode: "78701", country: "US" },
    shippingAddress: { street1: "789 Elm", city: "Austin", state: "TX", zipCode: "78701", country: "US" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.productDb.create({ ...tirzepatideProduct, id: "prod_1" });

  db.orderDb.create({
    id: "o1",
    patientId: "p1",
    productId: "prod_1",
    doseId: "tirzepatide_20mg_8_week",
    status: "sent_to_pharmacy",
    paymentStatus: "completed",
    pharmacyStatus: "draft",
    practiceQStatus: "submitted",
    quickbooksStatus: "invoiced",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

describe("lifefile.createPharmacyOrder", () => {
  beforeEach(seed);

  it("maps tirzepatide orders to pharmacy compound plus supplies", async () => {
    const order = db.orderDb.getById("o1")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);

    expect(pharmacyOrder.orderId).toBe("o1");
    expect(pharmacyOrder.patientId).toBe("p1");
    expect(pharmacyOrder.status).toBe("submitted");
    expect(pharmacyOrder.payload.order.rxs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drugName: "TIRZEPATIDE/PYRIDOXINE",
          drugStrength: "20MG/25MG/ML (2 ML)",
          quantity: 1,
          directions: "Inject 12.5 units (2.5mg) SbQ weekly.",
          daysSupply: 56,
        }),
        expect.objectContaining({
          drugName: "ALCOHOL SWABS",
          drugStrength: "EA",
          quantity: 10,
        }),
        expect.objectContaining({
          drugName: "COMFORT EZ 31GX5/16\" 1ML SYRINGE",
          drugStrength: "EA",
          quantity: 10,
        }),
      ])
    );
  });

  it("uses explicit tirzepatide label directions for higher 8-week doses", async () => {
    const order = db.orderDb.create({
      ...db.orderDb.getById("o1")!,
      id: "o_high",
      doseId: "tirzepatide_60mg_8_week",
    });

    const pharmacyOrder = await lifefile.createPharmacyOrder(order, { product: { ...tirzepatideProduct, id: "prod_1" } });
    expect(pharmacyOrder.payload.order.rxs[0]).toEqual(
      expect.objectContaining({
        drugName: "TIRZEPATIDE/PYRIDOXINE",
        quantity: 1,
        directions: "Inject 37.5 units (7.5mg) SbQ weekly.",
        daysSupply: 56,
      })
    );
  });

  it("saves pharmacy order to pharmacyOrderDb", async () => {
    const order = db.orderDb.getById("o1")!;
    await lifefile.createPharmacyOrder(order);
    expect(db.pharmacyOrderDb.getByOrder("o1")).not.toBeNull();
  });

  it("creates an integration log", async () => {
    const order = db.orderDb.getById("o1")!;
    await lifefile.createPharmacyOrder(order);
    const logs = db.integrationLogDb.getAll();
    const lifefileLog = logs.find((l) => l.integrationName === "lifefile");
    expect(lifefileLog).toBeDefined();
    expect(lifefileLog?.status).toBe("success");
  });

  it("throws when patient not found", async () => {
    const badOrder = { ...db.orderDb.getById("o1")!, patientId: "bad" };
    await expect(lifefile.createPharmacyOrder(badOrder)).rejects.toThrow("Invalid order data");
  });

  it("throws when product not found", async () => {
    const badOrder = { ...db.orderDb.getById("o1")!, productId: "bad" };
    await expect(lifefile.createPharmacyOrder(badOrder)).rejects.toThrow("Invalid order data");
  });

  it("posts live sandbox orders to the configured 1stChoiceRx endpoint with Life File headers", async () => {
    const original = { ...process.env };
    process.env.USE_REAL_LIFEFILE = "true";
    process.env.LF_X_VENDOR_ID = "11504";
    process.env.LF_X_LOCATION_ID = "110285";
    process.env.LF_X_API_NETWORK_ID = "1421";
    process.env.LF_API_USERNAME = "sandbox-user";
    process.env.LF_API_PASSWORD = "sandbox-pass";
    process.env.LF_ENDPOINT_ORDER_API = "https://host100-7.lifefile.net/lfapi/v1/order";
    process.env.LIFEFILE_PRACTICE_ID = "1018988";
    process.env.LIFEFILE_PRESCRIBER_NPI = "1760981450";
    process.env.LIFEFILE_PRESCRIBER_LICENSE_STATE = "FL";
    process.env.LIFEFILE_PRESCRIBER_LICENSE_NUMBER = "9231206";
    process.env.LIFEFILE_PRESCRIBER_FIRST_NAME = "Karen";
    process.env.LIFEFILE_PRESCRIBER_LAST_NAME = "Dotson";
    process.env.LIFEFILE_PRESCRIBER_EMAIL = "service@missionwlw.com";
    process.env.LIFEFILE_SHIPPING_SERVICE_ID = "6230";

    jest.resetModules();
    const liveLifefile = await import("@/services/lifefile");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "success", message: "ok", data: { orderId: "900001" } }),
    } as Response);
    global.fetch = fetchMock;

    const order = db.orderDb.getById("o1")!;
    const pharmacyOrder = await liveLifefile.createPharmacyOrder(order);

    expect(pharmacyOrder.lifeFileOrderId).toBe("900001");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://host100-7.lifefile.net/lfapi/v1/order",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Vendor-ID": "11504",
          "X-Location-ID": "110285",
          "X-API-Network-ID": "1421",
          Authorization: `Basic ${Buffer.from("sandbox-user:sandbox-pass").toString("base64")}`,
        }),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.order.practice.id).toBe(1018988);
    expect(body.order.patient.dateOfBirth).toBe("1978-03-22");
    expect(body.order.prescriber).toMatchObject({
      npi: "1760981450",
      licenseState: "FL",
      licenseNumber: "9231206",
      firstName: "Karen",
      lastName: "Dotson",
      email: "service@missionwlw.com",
    });
    expect(body.order.shipping.service).toBe(6230);

    process.env = original;
    (global as unknown as { fetch?: unknown }).fetch = undefined;
    jest.resetModules();
  });

  it("normalizes slash-formatted DOB before posting to Life File", async () => {
    const original = { ...process.env };
    process.env.USE_REAL_LIFEFILE = "true";
    process.env.LF_X_VENDOR_ID = "11504";
    process.env.LF_X_LOCATION_ID = "110285";
    process.env.LF_X_API_NETWORK_ID = "1421";
    process.env.LF_API_USERNAME = "sandbox-user";
    process.env.LF_API_PASSWORD = "sandbox-pass";
    process.env.LF_ENDPOINT_ORDER_API = "https://host100-7.lifefile.net/lfapi/v1/order";
    process.env.LIFEFILE_PRACTICE_ID = "1018988";
    process.env.LIFEFILE_SHIPPING_SERVICE_ID = "6230";

    jest.resetModules();
    const liveLifefile = await import("@/services/lifefile");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "success", message: "ok", data: { orderId: "900002" } }),
    } as Response);
    global.fetch = fetchMock;

    const order = db.orderDb.getById("o1")!;
    await liveLifefile.createPharmacyOrder(order, {
      patient: {
        ...db.patientDb.getById("p1")!,
        dateOfBirth: "3/22/1978",
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.order.patient.dateOfBirth).toBe("1978-03-22");

    process.env = original;
    (global as unknown as { fetch?: unknown }).fetch = undefined;
    jest.resetModules();
  });
});

describe("lifefile.getOrderStatus", () => {
  beforeEach(seed);

  it("returns draft status for unknown lifeFileOrderId", async () => {
    const result = await lifefile.getOrderStatus("nonexistent_lf_id");
    expect(result.status).toBe("draft");
    expect(result.details.error).toBeDefined();
  });

  it("returns status after pharmacy order created", async () => {
    const order = db.orderDb.getById("o1")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const lifeFileId = pharmacyOrder.lifeFileOrderId!;
    const result = await lifefile.getOrderStatus(lifeFileId);
    expect(result.status).toBe("submitted");
  });
});

describe("lifefile.addTrackingNumber", () => {
  beforeEach(seed);

  it("adds tracking number to existing pharmacy order", async () => {
    const order = db.orderDb.getById("o1")!;
    await lifefile.createPharmacyOrder(order);
    await lifefile.addTrackingNumber("o1", "1Z999AA10123456784");
    const pharmacyOrder = db.pharmacyOrderDb.getByOrder("o1");
    expect(pharmacyOrder?.trackingNumber).toBe("1Z999AA10123456784");
    expect(pharmacyOrder?.status).toBe("shipped");
  });
});
