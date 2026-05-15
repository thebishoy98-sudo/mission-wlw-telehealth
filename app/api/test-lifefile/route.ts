import { NextResponse } from "next/server";
import { serviceConfig } from "@/lib/service-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = serviceConfig.lifefile;
  const basicAuth = "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64");
  const url = `${c.baseUrl}/order`;

  const testPayload = {
    message: { id: 999999999, sentTime: new Date().toISOString() },
    order: {
      general: { memo: "TEST PING", referenceId: "test-ping-001" },
      prescriber: { npi: c.prescriberNpi || "1234567890", lastName: "TestPrescriber", firstName: "Sample", phone: "(555) 000-0001" },
      practice: { id: parseInt(c.practiceId || "0", 10) },
      patient: { firstName: "Test", lastName: "Ping", gender: "f" as const, dateOfBirth: "1990-01-01", address1: "123 Test St", city: "Miami", state: "FL", zip: "33101", country: "US", phoneMobile: "(555) 123-4567", email: "test-ping@example.com" },
      shipping: { recipientType: "patient" as const, recipientLastName: "Ping", recipientFirstName: "Test", recipientPhone: "(555) 123-4567", recipientEmail: "test-ping@example.com", addressLine1: "123 Test St", city: "Miami", state: "FL", zipCode: "33101", country: "US", service: 999 },
      billing: { payorType: "pat" as const },
      rxs: [{ rxType: "new" as const, drugName: "Acetaminophen", drugStrength: "500mg", drugForm: "tablet", lfProductID: 305492221, quantity: "30", quantityUnits: "each", directions: "As directed", refills: 0, dateWritten: new Date().toISOString().split("T")[0], daysSupply: 30, scheduleCode: "L" as const }],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth,
        "X-Vendor-ID": c.vendorId,
        "X-Location-ID": c.locationId,
        "X-API-Network-ID": c.apiNetworkId,
      },
      body: JSON.stringify(testPayload),
    });
    const body = await res.json().catch(() => ({ raw: await res.text() }));
    return NextResponse.json({
      httpStatus: res.status,
      httpOk: res.ok,
      config: { baseUrl: c.baseUrl, vendorId: c.vendorId, locationId: c.locationId, apiNetworkId: c.apiNetworkId, practiceId: c.practiceId, useMock: c.useMock },
      response: body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, config: { baseUrl: c.baseUrl, useMock: c.useMock } }, { status: 500 });
  }
}
