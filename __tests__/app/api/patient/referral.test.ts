import { getPatientIdFromRequest } from "@/lib/patient-session";
import * as dbServer from "@/lib/db.server";
import {
  createOrGetPatientReferral,
  getPatientReferral,
  getReferralBalance,
} from "@/lib/referral-credit.server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/patient-session", () => ({
  getPatientIdFromRequest: jest.fn(),
}));

jest.mock("@/lib/db.server", () => ({
  patientDb: { getById: jest.fn() },
  orderDb: { getByPatient: jest.fn() },
  paymentDb: { getByOrders: jest.fn() },
}));

jest.mock("@/lib/referral-credit.server", () => ({
  createOrGetPatientReferral: jest.fn(),
  getPatientReferral: jest.fn(),
  getReferralBalance: jest.fn(),
}));

jest.mock("@/lib/public-url", () => ({
  getPublicBaseUrl: jest.fn(() => "https://missionwlw.com"),
}));

const { GET } = require("@/app/api/patient/referral/route");

describe("GET /api/patient/referral", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPatientIdFromRequest as jest.Mock).mockReturnValue("patient-1");
    (getPatientReferral as jest.Mock).mockResolvedValue({
      affiliateId: "affiliate-1",
      code: "ref-pat-owner-der-1",
      patientId: "patient-1",
    });
    (getReferralBalance as jest.Mock).mockResolvedValue(100);
  });

  it("requires a patient session", async () => {
    (getPatientIdFromRequest as jest.Mock).mockReturnValue(null);
    const response = await GET({ headers: { get: () => null } } as any);
    expect(response.status).toBe(401);
  });

  it("returns the real referral link and available balance", async () => {
    const response = await GET({ headers: { get: () => null } } as any);
    await expect(response.json()).resolves.toEqual({
      code: "ref-pat-owner-der-1",
      link: "https://missionwlw.com?ref=ref-pat-owner-der-1",
      balance: 100,
    });
    expect(createOrGetPatientReferral).not.toHaveBeenCalled();
  });

  it("creates a stable referral for an existing paid patient when missing", async () => {
    (getPatientReferral as jest.Mock).mockResolvedValue(null);
    (dbServer.patientDb.getById as jest.Mock).mockResolvedValue({
      id: "patient-1",
      firstName: "Pat",
      lastName: "Owner",
    });
    (dbServer.orderDb.getByPatient as jest.Mock).mockResolvedValue([
      { id: "order-1", patientId: "patient-1" },
    ]);
    (dbServer.paymentDb.getByOrders as jest.Mock).mockResolvedValue([
      { orderId: "order-1", patientId: "patient-1", status: "completed" },
    ]);
    (createOrGetPatientReferral as jest.Mock).mockResolvedValue({
      affiliateId: "affiliate-1",
      code: "ref-pat-owner-der-1",
      patientId: "patient-1",
    });

    const response = await GET({ headers: { get: () => null } } as any);

    expect(response.status).toBe(200);
    expect(createOrGetPatientReferral).toHaveBeenCalledWith({
      patientId: "patient-1",
      displayName: "Pat Owner",
      orderId: "order-1",
    });
  });
});
