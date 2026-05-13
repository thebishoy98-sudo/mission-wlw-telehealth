import * as db from "@/lib/db";
import type { Patient, Order } from "@/types";

const makePatient = (id = "p1"): Patient => ({
  id,
  firstName: "Alice",
  lastName: "Smith",
  dateOfBirth: "1990-01-01",
  gender: "female",
  phone: "5551234567",
  email: "alice@example.com",
  address: { street1: "123 Main St", city: "Anytown", state: "TX", zipCode: "75001", country: "US" },
  shippingAddress: { street1: "123 Main St", city: "Anytown", state: "TX", zipCode: "75001", country: "US" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeOrder = (id = "o1", patientId = "p1"): Order => ({
  id,
  patientId,
  productId: "prod_1",
  doseId: "dose_1",
  status: "draft",
  paymentStatus: "pending",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("patientDb", () => {
  it("creates and retrieves a patient by id", () => {
    const patient = makePatient();
    db.patientDb.create(patient);
    expect(db.patientDb.getById("p1")).toMatchObject({ firstName: "Alice" });
  });

  it("returns null for unknown id", () => {
    expect(db.patientDb.getById("nonexistent")).toBeNull();
  });

  it("updates patient fields", () => {
    const patient = makePatient();
    db.patientDb.create(patient);
    db.patientDb.update("p1", { firstName: "Alicia" });
    expect(db.patientDb.getById("p1")?.firstName).toBe("Alicia");
  });

  it("returns all patients", () => {
    db.patientDb.create(makePatient("p1"));
    db.patientDb.create(makePatient("p2"));
    expect(db.patientDb.getAll()).toHaveLength(2);
  });

  it("getAll returns empty array when no patients", () => {
    expect(db.patientDb.getAll()).toEqual([]);
  });

  it("getByEmail finds patient by email", () => {
    db.patientDb.create(makePatient("p1"));
    const found = db.patientDb.getByEmail("alice@example.com");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("p1");
  });

  it("getByEmail returns null for unknown email", () => {
    expect(db.patientDb.getByEmail("unknown@example.com")).toBeNull();
  });
});

describe("orderDb", () => {
  it("creates and retrieves an order", () => {
    db.orderDb.create(makeOrder());
    expect(db.orderDb.getById("o1")).toMatchObject({ status: "draft" });
  });

  it("updates order status", () => {
    db.orderDb.create(makeOrder());
    db.orderDb.update("o1", { status: "sent_to_pharmacy" });
    expect(db.orderDb.getById("o1")?.status).toBe("sent_to_pharmacy");
  });

  it("getByPatient returns orders for a patient", () => {
    db.orderDb.create(makeOrder("o1", "p1"));
    db.orderDb.create(makeOrder("o2", "p1"));
    db.orderDb.create(makeOrder("o3", "p2"));
    expect(db.orderDb.getByPatient("p1")).toHaveLength(2);
    expect(db.orderDb.getByPatient("p2")).toHaveLength(1);
  });

  it("getByStatus filters orders correctly", () => {
    db.orderDb.create(makeOrder("o1"));
    db.orderDb.create({ ...makeOrder("o2"), status: "sent_to_pharmacy" });
    const drafts = db.orderDb.getByStatus("draft");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe("o1");
  });

  it("returns null for update on unknown id", () => {
    expect(db.orderDb.update("nonexistent", { status: "approved" })).toBeNull();
  });
});

describe("providerReviewDb", () => {
  it("creates and retrieves review by order", () => {
    db.providerReviewDb.create({
      id: "rev1",
      orderId: "o1",
      patientId: "p1",
      status: "pending",
    });
    expect(db.providerReviewDb.getByOrder("o1")).toMatchObject({ status: "pending" });
  });

  it("returns null for unknown order", () => {
    expect(db.providerReviewDb.getByOrder("nonexistent")).toBeNull();
  });

  it("updates review status", () => {
    db.providerReviewDb.create({ id: "rev1", orderId: "o1", patientId: "p1", status: "pending" });
    db.providerReviewDb.update("rev1", { status: "approved", reviewedBy: "dr.smith" });
    expect(db.providerReviewDb.getByOrder("o1")?.status).toBe("approved");
    expect(db.providerReviewDb.getByOrder("o1")?.reviewedBy).toBe("dr.smith");
  });
});
