/** @jest-environment node */

import fs from "fs";
import path from "path";
import { getChargeAmount } from "@/lib/payment-amount";

describe("payment charge amount contract", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("charges the configured test override instead of the product price", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "0.01",
    };

    expect(getChargeAmount(299.99)).toBe(0.01);
  });

  it("falls back to the submitted amount when no override is configured", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "",
    };

    expect(getChargeAmount("299.99")).toBe(299.99);
  });

  it("rejects missing or invalid charge amounts", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "",
    };

    expect(getChargeAmount(undefined)).toBeNull();
    expect(getChargeAmount("not-a-number")).toBeNull();
    expect(getChargeAmount(0)).toBeNull();
  });
});

describe("payment identity storage contract", () => {
  const chargeRoute = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");
  const providerUploadRoute = fs.readFileSync(path.join(process.cwd(), "app/api/provider/uploads/[id]/route.ts"), "utf8");
  const practiceQWorker = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");

  it("stores checkout identity media through the identity storage service, not base64 upload rows", () => {
    expect(chargeRoute).toContain("assertIdentityStorageReady");
    expect(chargeRoute).toContain("buildIdentityUploads");
    expect(chargeRoute).not.toContain("base64Data: identityUploads.licenseImageData");
    expect(chargeRoute).not.toContain("base64Data: identityData");
  });

  it("serves staff upload previews through storage reads instead of redirecting s3 references", () => {
    expect(providerUploadRoute).toContain("loadIdentityMedia");
    expect(providerUploadRoute).not.toContain("NextResponse.redirect(upload.storageUrl)");
  });

  it("lets the PracticeQ worker attach identity media from storage-backed upload rows", () => {
    expect(practiceQWorker).toContain("loadIdentityMedia");
    expect(practiceQWorker).toContain("selectPracticeQUploadFile");
  });

  it("enforces that the consent signature matches the patient name server-side", () => {
    expect(chargeRoute).toContain("doesSignatureMatchPatient");
    expect(chargeRoute).toContain("Consent signature must match the patient name");
  });
});

describe("payment card-on-file checkout contract", () => {
  const chargeRoute = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");

  it("uses the one-time token charge by default and only saves a card when explicitly enabled", () => {
    const optInGuard =
      'token && process.env.QB_CLIENT_ID && process.env.QB_SAVE_CARD_AT_CHECKOUT === "true"';
    const optInIndex = chargeRoute.indexOf(optInGuard);
    const oneTimeChargeIndex = chargeRoute.indexOf(
      "chargeResult = await qbPayments.chargeCard",
      optInIndex
    );

    expect(optInIndex).toBeGreaterThan(-1);
    expect(chargeRoute.indexOf("if (!enrollmentCardInfo)", optInIndex)).toBeLessThan(oneTimeChargeIndex);
    expect(oneTimeChargeIndex).toBeGreaterThan(optInIndex);
  });
});
