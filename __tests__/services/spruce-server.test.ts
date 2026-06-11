/** @jest-environment node */

import { buildSpruceMessageRecord, normalizeSprucePhoneNumber, renderSpruceTemplate } from "@/services/spruce.server";
import fs from "fs";
import path from "path";
import type { Patient } from "@/types";

const patient: Patient = {
  id: "p1",
  firstName: "Allen",
  lastName: "S",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "alentest@gmail.com",
  address: { street1: "5319 Davisson", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
  shippingAddress: { street1: "5319 Davisson", city: "Orlando", state: "FL", zipCode: "32810", country: "US" },
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:00:00.000Z",
};

describe("renderSpruceTemplate", () => {
  it("renders an identity upload reminder with the upload link", () => {
    const text = renderSpruceTemplate("identity_upload_reminder", {
      uploadUrl: "https://mission-wlw-dev.vercel.app/verify-identity/token",
    });

    expect(text).toContain("identity verification");
    expect(text).toContain("10-second identity video");
    expect(text).not.toContain("selfie video");
    expect(text).toContain("https://mission-wlw-dev.vercel.app/verify-identity/token");
  });

  it("renders a distinct message when identity proof was already submitted", () => {
    const text = renderSpruceTemplate("identity_review_received", {
      orderId: "o1",
    });

    expect(text).toContain("identity verification were received");
    expect(text).toContain("provider will review");
    expect(text).not.toContain("still need identity verification");
    expect(text).not.toContain("Upload your ID");
  });

  it("renders shipped messages with a FedEx tracking link", () => {
    const text = renderSpruceTemplate("order_shipped", {
      trackingNumber: "784578178554",
    });

    expect(text).toContain("FedEx");
    expect(text).toContain("https://www.fedex.com/fedextrack/?trknbr=784578178554");
  });

  it("renders out-for-delivery messages with a FedEx tracking link", () => {
    const text = renderSpruceTemplate("order_out_for_delivery", {
      trackingNumber: "784578178554",
    });

    expect(text).toContain("out for delivery today");
    expect(text).toContain("https://www.fedex.com/fedextrack/?trknbr=784578178554");
  });
});

describe("buildSpruceMessageRecord", () => {
  it("builds an auditable Spruce message record for a server patient", () => {
    const message = buildSpruceMessageRecord(patient, "order_sent_to_pharmacy", {
      orderId: "o1",
    });

    expect(message).toMatchObject({
      orderId: "o1",
      patientId: "p1",
      templateKey: "order_sent_to_pharmacy",
      phoneNumber: "+17328228376",
      status: "pending",
    });
    expect(message.messageText).toContain("sent to the pharmacy");
  });

  it("normalizes patient SMS phone numbers before sending to Spruce", () => {
    expect(normalizeSprucePhoneNumber("7328228376")).toBe("+17328228376");
    expect(normalizeSprucePhoneNumber("+1 (732) 822-8376")).toBe("+17328228376");
    expect(normalizeSprucePhoneNumber("73228228376")).toBe("+17322822837");
    expect(normalizeSprucePhoneNumber("12345")).toBeNull();
  });
});

describe("Render Spruce configuration", () => {
  const renderYaml = fs.readFileSync(path.join(process.cwd(), "render.yaml"), "utf8");

  it("does not hard-code live Spruce messaging off in the Render blueprint", () => {
    expect(renderYaml).not.toMatch(/key:\s*USE_REAL_SPRUCE\s*\r?\n\s*value:\s*false/);
    expect(renderYaml).toContain("key: USE_REAL_SPRUCE");
    expect(renderYaml).toContain("key: SPRUCE_AUTH_TOKEN");
    expect(renderYaml).toContain("key: SPRUCE_INTERNAL_ENDPOINT_ID");
  });
});
