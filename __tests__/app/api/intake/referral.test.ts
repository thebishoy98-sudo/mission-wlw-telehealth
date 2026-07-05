import * as dbServer from "@/lib/db.server";
import { createOrGetPatientReferral } from "@/lib/referral-credit.server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/db.server", () => ({
  orderDb: { getById: jest.fn() },
  patientDb: { getById: jest.fn() },
  paymentDb: { getByOrder: jest.fn() },
}));

jest.mock("@/lib/referral-credit.server", () => ({
  createOrGetPatientReferral: jest.fn(),
}));

jest.mock("@/lib/public-url", () => ({
  getPublicBaseUrl: jest.fn(() => "https://missionwlw.com"),
}));

const { POST } = require("@/app/api/intake/referral/route");

function request(body: unknown) {
  return { json: async () => body, headers: { get: () => null } } as any;
}

describe("POST /api/intake/referral", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.POSTGRES_URL = "postgres://configured";
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue({
      id: "order-1",
      patientId: "patient-1",
      paymentStatus: "completed",
    });
    (dbServer.paymentDb.getByOrder as jest.Mock).mockResolvedValue({
      orderId: "order-1",
      patientId: "patient-1",
      status: "completed",
    });
    (dbServer.patientDb.getById as jest.Mock).mockResolvedValue({
      id: "patient-1",
      firstName: "Pat",
      lastName: "Owner",
    });
    (createOrGetPatientReferral as jest.Mock).mockResolvedValue({
      affiliateId: "affiliate-1",
      code: "ref-pat-owner-der-1",
      patientId: "patient-1",
    });
  });

  it("derives referral ownership from a successfully paid order", async () => {
    const response = await POST(request({
      orderId: "order-1",
      firstName: "Forged",
      lastName: "Name",
    }));

    expect(response.status).toBe(200);
    expect(createOrGetPatientReferral).toHaveBeenCalledWith({
      patientId: "patient-1",
      displayName: "Pat Owner",
      orderId: "order-1",
    });
    await expect(response.json()).resolves.toEqual({
      code: "ref-pat-owner-der-1",
      link: "https://missionwlw.com?ref=ref-pat-owner-der-1",
    });
  });

  it("does not create a referral for an unpaid order", async () => {
    (dbServer.paymentDb.getByOrder as jest.Mock).mockResolvedValue({
      orderId: "order-1",
      patientId: "patient-1",
      status: "failed",
    });

    const response = await POST(request({ orderId: "order-1" }));

    expect(response.status).toBe(404);
    expect(createOrGetPatientReferral).not.toHaveBeenCalled();
  });
});
