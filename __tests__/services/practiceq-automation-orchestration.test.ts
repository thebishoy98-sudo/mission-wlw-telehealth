import type { Order, Patient, PracticeQAutomationJob } from "@/types";

const mockDbServer = {
  practiceqAutomationJobDb: {
    getByOrder: jest.fn(),
    getActiveByPatient: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  orderDb: {
    update: jest.fn(),
  },
  patientDb: {
    getById: jest.fn(),
  },
  integrationLogDb: {
    create: jest.fn(),
  },
};

const mockDb = {
  practiceqAutomationJobDb: {
    create: jest.fn(),
  },
  orderDb: {
    update: jest.fn(),
  },
};

const mockCreatePracticeQAutomationJob = jest.fn();
const mockCompletePracticeQSession = jest.fn();

jest.mock("@/lib/db.server", () => mockDbServer);
jest.mock("@/lib/db", () => mockDb);
jest.mock("@/services/practiceq-automation", () => ({
  createPracticeQAutomationJob: mockCreatePracticeQAutomationJob,
}));
jest.mock("@/lib/practiceq-session-completion", () => ({
  completePracticeQSession: mockCompletePracticeQSession,
}));

import {
  queuePracticeQAutomationForOrder,
  resumePracticeQAfterIdentityApproval,
} from "@/services/practiceq-automation-orchestration";

const now = "2026-06-02T12:00:00.000Z";

const order: Order = {
  id: "order_1",
  patientId: "patient_1",
  productId: "product_tirzepatide",
  doseId: "tirzepatide_20mg_8_week",
  status: "approved",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "skipped",
  identityStatus: "verified",
  createdAt: now,
  updatedAt: now,
};

const patient: Patient = {
  id: "patient_1",
  firstName: "Test",
  lastName: "Patient",
  dateOfBirth: "1990-01-01",
  gender: "female",
  phone: "5555555555",
  email: "patient@example.com",
  address: {
    street1: "1 Main St",
    city: "Orlando",
    state: "FL",
    zipCode: "32801",
    country: "USA",
  },
  shippingAddress: {
    street1: "1 Main St",
    city: "Orlando",
    state: "FL",
    zipCode: "32801",
    country: "USA",
  },
  createdAt: now,
  updatedAt: now,
};

const job: PracticeQAutomationJob = {
  id: "job_1",
  orderId: order.id,
  patientId: patient.id,
  status: "queued",
  attempts: 0,
  practiceQStartUrl: "https://intakeq.com/new/yjvht0",
  handoffToken: "handoff_1",
  handoffExpiresAt: "2026-06-02T12:30:00.000Z",
  createdAt: now,
  updatedAt: now,
};

describe("PracticeQ automation orchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbServer.practiceqAutomationJobDb.getByOrder.mockResolvedValue(null);
    mockDbServer.practiceqAutomationJobDb.getActiveByPatient.mockResolvedValue(null);
    mockDbServer.practiceqAutomationJobDb.create.mockResolvedValue(job);
    mockDbServer.orderDb.update.mockResolvedValue({ ...order, practiceQStatus: "pending" });
    mockDbServer.patientDb.getById.mockResolvedValue(patient);
    mockCreatePracticeQAutomationJob.mockReturnValue(job);
  });

  it("queues a PracticeQ job for a verified paid order with no existing job", async () => {
    await expect(
      queuePracticeQAutomationForOrder({ order, patient, source: "payment_charge" })
    ).resolves.toMatchObject({ status: "queued", jobId: job.id });

    expect(mockCreatePracticeQAutomationJob).toHaveBeenCalledWith(order, patient);
    expect(mockDbServer.practiceqAutomationJobDb.create).toHaveBeenCalledWith(job);
    expect(mockDb.practiceqAutomationJobDb.create).toHaveBeenCalledWith(job);
    expect(mockDbServer.orderDb.update).toHaveBeenCalledWith(order.id, { practiceQStatus: "pending" });
  });

  it("queues PracticeQ after delayed identity approval when checkout deferred it", async () => {
    const wakeRemoteWorker = jest.fn().mockResolvedValue(undefined);

    await expect(
      resumePracticeQAfterIdentityApproval({ order, source: "identity_upload", wakeRemoteWorker })
    ).resolves.toMatchObject({ status: "queued", jobId: job.id });

    expect(mockDbServer.patientDb.getById).toHaveBeenCalledWith(order.patientId);
    expect(mockCreatePracticeQAutomationJob).toHaveBeenCalledWith(order, patient);
    expect(wakeRemoteWorker).toHaveBeenCalled();
    expect(mockCompletePracticeQSession).not.toHaveBeenCalled();
  });

  it("queues PracticeQ after admin manual approval", async () => {
    const wakeRemoteWorker = jest.fn().mockResolvedValue(undefined);
    const manuallyApproved = { ...order, identityStatus: "manual_approved" as const };

    await expect(
      resumePracticeQAfterIdentityApproval({
        order: manuallyApproved,
        source: "identity_approval",
        wakeRemoteWorker,
      })
    ).resolves.toMatchObject({ status: "queued", jobId: job.id });

    expect(mockDbServer.patientDb.getById).toHaveBeenCalledWith(manuallyApproved.patientId);
    expect(mockCreatePracticeQAutomationJob).toHaveBeenCalledWith(manuallyApproved, patient);
    expect(mockDbServer.practiceqAutomationJobDb.create).toHaveBeenCalledWith(job);
    expect(wakeRemoteWorker).toHaveBeenCalled();
  });
});
