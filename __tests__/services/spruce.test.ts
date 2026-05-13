import * as spruce from "@/services/spruce";
import * as db from "@/lib/db";

const seedTemplate = (key: string, body: string) => {
  db.messageTemplateDb.create({
    id: `tmpl_${key}`,
    key,
    category: "intake",
    subject: key,
    body,
    variables: ["patientName"],
    createdAt: new Date().toISOString(),
  });
};

const seedPatient = () => {
  db.patientDb.create({
    id: "p1",
    firstName: "Alice",
    lastName: "Smith",
    dateOfBirth: "1990-01-01",
    gender: "female",
    phone: "5551234567",
    email: "alice@example.com",
    address: { street1: "123 Main", city: "Dallas", state: "TX", zipCode: "75001", country: "US" },
    shippingAddress: { street1: "123 Main", city: "Dallas", state: "TX", zipCode: "75001", country: "US" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

describe("spruce.sendMessage", () => {
  beforeEach(() => {
    seedPatient();
    seedTemplate("payment_received", "Hi {{patientName}}, payment received!");
  });

  it("sends a message and saves to spruceDb", () => {
    const result = spruce.sendMessage("p1", "payment_received", { orderId: "o1" });
    expect(result.status).toBe("sent");
    expect(db.spruceDb.getByOrder("o1")).toHaveLength(1);
  });

  it("creates an integration log entry", () => {
    spruce.sendMessage("p1", "payment_received", { orderId: "o1" });
    const logs = db.integrationLogDb.getAll();
    const spruceLog = logs.find((l) => l.integrationName === "spruce");
    expect(spruceLog).toBeDefined();
  });

  it("throws when patient not found", () => {
    expect(() => spruce.sendMessage("nonexistent", "payment_received")).toThrow();
  });

  it("throws when template not found", () => {
    expect(() => spruce.sendMessage("p1", "nonexistent_template")).toThrow();
  });
});

describe("spruce.scheduleMessage", () => {
  beforeEach(() => {
    seedPatient();
    seedTemplate("reorder_reminder", "Time to reorder, {{patientName}}!");
  });

  it("schedules a message with pending status", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = spruce.scheduleMessage("p1", "reorder_reminder", futureDate, { orderId: "o1" });
    expect(result.status).toBe("scheduled");
    expect(result.scheduledFor).toBe(futureDate);
  });
});

describe("spruce.getMessageTemplates", () => {
  it("returns an array of templates", () => {
    seedTemplate("t1", "Body 1");
    seedTemplate("t2", "Body 2");
    const templates = spruce.getMessageTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });
});
