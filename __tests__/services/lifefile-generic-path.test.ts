/**
 * Tests for the generic (non-tirzepatide) LifeFile Rx path:
 * Retatrutide and Semaglutide should produce 3 Rx items
 * (drug + alcohol swabs + syringe) with correct 1-1 supply ratio
 * and a memo derived from the first Rx line.
 */
import * as lifefile from "@/services/lifefile";
import * as db from "@/lib/db";
import { retatrutideProduct, semaglutideProduct } from "@/data/products";
import type { Product } from "@/types";

const basePatient = {
  id: "p_gen",
  firstName: "Jane",
  lastName: "Smith",
  dateOfBirth: "1985-06-15",
  gender: "female" as const,
  phone: "5550002222",
  email: "jane@example.com",
  address: { street1: "1 Main St", city: "Miami", state: "FL", zipCode: "33101", country: "US" },
  shippingAddress: { street1: "1 Main St", city: "Miami", state: "FL", zipCode: "33101", country: "US" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function seedWith(product: Product, doseId: string) {
  db.clearAllData();
  db.patientDb.create(basePatient);
  db.productDb.create(product);
  db.orderDb.create({
    id: "o_gen",
    patientId: "p_gen",
    productId: product.id,
    doseId,
    status: "sent_to_pharmacy",
    paymentStatus: "completed",
    pharmacyStatus: "draft",
    practiceQStatus: "submitted",
    quickbooksStatus: "invoiced",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe("lifefile generic path — Retatrutide", () => {
  beforeEach(() => seedWith(retatrutideProduct, "retatrutide_16mg_8_week"));

  it("includes 3 Rx items: drug + swabs + syringe", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const rxs = pharmacyOrder.payload.order.rxs as Record<string, unknown>[];
    expect(rxs).toHaveLength(3);
  });

  it("drug Rx has uppercase name and correct form", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const drug = (pharmacyOrder.payload.order.rxs as Record<string, unknown>[])[0];
    expect(drug.drugName).toBe("RETATRUTIDE");
    expect(drug.drugForm).toBe("INJECTABLE");
    expect(drug.quantity).toBe(1); // stored as parsed integer
  });

  it("supplies qty is 10× vial qty (1-1 ratio)", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const rxs = pharmacyOrder.payload.order.rxs as Record<string, unknown>[];
    const swabs = rxs.find((r) => r.drugName === "ALCOHOL SWABS");
    const syringe = rxs.find((r) => String(r.drugName).includes("SYRINGE"));
    expect(swabs?.quantity).toBe(10); // stored as parsed integer
    expect(syringe?.quantity).toBe(10);
  });

  it("memo is derived from first Rx line description", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const memo = pharmacyOrder.payload.order.general.memo as string;
    expect(memo).toMatch(/RETATRUTIDE/);
    expect(memo).toMatch(/INJECTABLE/);
    expect(memo).toMatch(/QTY/);
  });

  it("does not include lfProductID (avoids catalog mismatch)", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const drug = (pharmacyOrder.payload.order.rxs as Record<string, unknown>[])[0];
    expect(drug.lfProductID).toBeUndefined();
  });

  it("daysSupply is 8 weeks (56 days)", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const drug = (pharmacyOrder.payload.order.rxs as Record<string, unknown>[])[0];
    expect(drug.daysSupply).toBe(56);
  });

  it.each([
    [
      "retatrutide_16mg_8_week",
      "16mg/1mL vial",
      "Take 12.5 units (2mg) subcutaneous injection once a week for eight weeks.",
    ],
    [
      "retatrutide_32mg_8_week",
      "32mg/2mL vial",
      "Take 25 units (4mg) subcutaneous injection once a week for eight weeks.",
    ],
    [
      "retatrutide_48mg_8_week",
      "48mg/3mL vial",
      "Take 37.5 units (6mg) subcutaneous injection once a week for eight weeks.",
    ],
  ])("sends exact RETA vial strength and SIG for %s", async (doseId, expectedStrength, expectedDirections) => {
    seedWith(retatrutideProduct, doseId);
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const drug = (pharmacyOrder.payload.order.rxs as Record<string, unknown>[])[0];

    expect(drug.drugStrength).toBe(expectedStrength);
    expect(drug.quantity).toBe(1);
    expect(drug.directions).toBe(expectedDirections);
  });

  it("saves pharmacy order and integration log", async () => {
    const order = db.orderDb.getById("o_gen")!;
    await lifefile.createPharmacyOrder(order);
    expect(db.pharmacyOrderDb.getByOrder("o_gen")).not.toBeNull();
    const log = db.integrationLogDb.getAll().find((l) => l.integrationName === "lifefile");
    expect(log?.status).toBe("success");
  });
});

describe("lifefile generic path — Semaglutide", () => {
  beforeEach(() => seedWith(semaglutideProduct, "semaglutide_2mg_8_week"));

  it("includes 3 Rx items for semaglutide order", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const rxs = pharmacyOrder.payload.order.rxs as Record<string, unknown>[];
    expect(rxs).toHaveLength(3);
  });

  it("drug Rx has SEMAGLUTIDE name", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const drug = (pharmacyOrder.payload.order.rxs as Record<string, unknown>[])[0];
    expect(drug.drugName).toBe("SEMAGLUTIDE");
  });

  it("memo references SEMAGLUTIDE", async () => {
    const order = db.orderDb.getById("o_gen")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const memo = pharmacyOrder.payload.order.general.memo as string;
    expect(memo).toMatch(/SEMAGLUTIDE/);
  });
});

describe("lifefile generic path — higher vial quantity", () => {
  it("scales swabs and syringes with vial count", async () => {
    db.clearAllData();
    db.patientDb.create(basePatient);
    const multiDoseProduct: Product = {
      ...retatrutideProduct,
      id: "prod_reta_multi",
      doses: [
        {
          id: "reta_multi_dose",
          label: "Retatrutide 16mg x3",
          strength: "16mg vial",
          quantity: 3,
          price: 900,
          durationWeeks: 24,
          patientDescription: "24-Week Prescription",
        },
      ],
    };
    db.productDb.create(multiDoseProduct);
    db.orderDb.create({
      id: "o_multi",
      patientId: "p_gen",
      productId: "prod_reta_multi",
      doseId: "reta_multi_dose",
      status: "sent_to_pharmacy",
      paymentStatus: "completed",
      pharmacyStatus: "draft",
      practiceQStatus: "submitted",
      quickbooksStatus: "invoiced",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const order = db.orderDb.getById("o_multi")!;
    const pharmacyOrder = await lifefile.createPharmacyOrder(order);
    const rxs = pharmacyOrder.payload.order.rxs as Record<string, unknown>[];
    const swabs = rxs.find((r) => r.drugName === "ALCOHOL SWABS");
    expect(swabs?.quantity).toBe(30); // 3 vials × 10, stored as parsed integer
  });
});
