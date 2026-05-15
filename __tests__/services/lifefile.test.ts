import * as lifefile from "@/services/lifefile";
import * as db from "@/lib/db";

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

  db.productDb.create({
    id: "prod_1",
    name: "Tirzepatide",
    slug: "tirzepatide",
    description: "GLP-1",
    startingPrice: 299,
    image: "/img.svg",
    doses: [{ id: "dose_1", label: "2.5mg Starter", strength: "2.5mg", quantity: 1, price: 299 }],
    eligibilityNote: "BMI ≥ 27",
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  db.orderDb.create({
    id: "o1",
    patientId: "p1",
    productId: "prod_1",
    doseId: "dose_1",
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

  it("creates a pharmacy order with correct structure", async () => {
    const order = db.orderDb.getById("o1")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);

    expect(pharmacyOrder.orderId).toBe("o1");
    expect(pharmacyOrder.patientId).toBe("p1");
    expect(pharmacyOrder.status).toBe("submitted");
    expect(pharmacyOrder.payload.order.rxs).toHaveLength(1);
    expect(pharmacyOrder.payload.order.rxs[0].drugName).toBe("Tirzepatide");
    expect(pharmacyOrder.payload.order.rxs[0].drugStrength).toBe("2.5mg");
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
