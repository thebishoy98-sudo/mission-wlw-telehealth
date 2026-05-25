import * as practiceq from "@/services/practiceq";
import * as db from "@/lib/db";
import type { Order, Patient, Product } from "@/types";

const makePatient = (): Patient => ({
  id: "p1",
  firstName: "Bob",
  lastName: "Jones",
  dateOfBirth: "1985-06-15",
  gender: "male",
  phone: "5559876543",
  email: "bob@example.com",
  address: { street1: "456 Oak St", city: "Dallas", state: "TX", zipCode: "75201", country: "US" },
  shippingAddress: { street1: "456 Oak St", city: "Dallas", state: "TX", zipCode: "75201", country: "US" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeProduct = (): Product => ({
  id: "prod_1",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "GLP-1/GIP Receptor Agonist",
  startingPrice: 299,
  image: "/product-tirzepatide.svg",
  doses: [{ id: "dose_1", label: "2.5mg Starter", strength: "2.5mg", quantity: 1, price: 299 }],
  eligibilityNote: "BMI ≥ 27",
  isActive: true,
  createdAt: new Date().toISOString(),
});

const makeOrder = (): Order => ({
  id: "o1",
  patientId: "p1",
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

describe("practiceq.submitIntakePacket", () => {
  beforeEach(() => {
    db.patientDb.create(makePatient());
    db.productDb.create(makeProduct());
    db.orderDb.create(makeOrder());
  });

  it("creates a PracticeQ packet for valid order", async () => {
    const order = db.orderDb.getById("o1")!;
    const packet = await practiceq.submitIntakePacket(order);

    expect(packet.orderId).toBe("o1");
    expect(packet.patientId).toBe("p1");
    expect(packet.status).toBe("submitted");
    expect(packet.packetData.productRequested).toBe("Tirzepatide");
    expect(packet.packetData.doseSelected).toBe("2.5mg Starter");
  });

  it("saves packet to practiceqDb", async () => {
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    expect(db.practiceqDb.getByOrder("o1")).not.toBeNull();
  });

  it("creates an integration log entry", async () => {
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    const logs = db.integrationLogDb.getAll();
    const pqLog = logs.find((l) => l.integrationName === "practiceq");
    expect(pqLog).toBeDefined();
    expect(pqLog?.status).toBe("success");
    expect(pqLog?.orderId).toBe("o1");
  });

  it("throws when patient not found", async () => {
    const badOrder = { ...makeOrder(), patientId: "nonexistent" };
    await expect(practiceq.submitIntakePacket(badOrder)).rejects.toThrow("Patient or product not found");
  });

  it("throws when product not found", async () => {
    const badOrder = { ...makeOrder(), productId: "nonexistent" };
    await expect(practiceq.submitIntakePacket(badOrder)).rejects.toThrow("Patient or product not found");
  });
});

describe("practiceq.getPacketStatus", () => {
  it("returns not_found for unknown order", () => {
    const result = practiceq.getPacketStatus("nonexistent");
    expect(result.status).toBe("not_found");
    expect(result.errors).toBeDefined();
  });

  it("returns submitted status after packet creation", async () => {
    db.patientDb.create(makePatient());
    db.productDb.create(makeProduct());
    db.orderDb.create(makeOrder());
    const order = db.orderDb.getById("o1")!;
    await practiceq.submitIntakePacket(order);
    const result = practiceq.getPacketStatus("o1");
    expect(result.status).toBe("submitted");
  });
});
