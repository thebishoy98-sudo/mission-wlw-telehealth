/** @jest-environment node */

import { buildSpruceMessageRecord, renderSpruceTemplate } from "@/services/spruce.server";
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
      phoneNumber: "7328228376",
      status: "pending",
    });
    expect(message.messageText).toContain("sent to the pharmacy");
  });
});
