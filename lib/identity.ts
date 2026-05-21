import crypto from "crypto";
import type { IdentityAiResult, IdentityStatus, Order, Upload } from "@/types";

export const IDENTITY_PASS_STATUSES: IdentityStatus[] = ["verified", "manual_approved"];

export function createIdentityUploadToken(orderId: string) {
  return `idv_${orderId}_${crypto.randomBytes(18).toString("base64url")}`;
}

export function buildIdentityUploadUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/verify-identity/${encodeURIComponent(token)}`;
}

export function getIdentityGate(order: Pick<Order, "identityStatus">) {
  const canDispatch = !!order.identityStatus && IDENTITY_PASS_STATUSES.includes(order.identityStatus);
  return {
    canDispatch,
    blockedReason: canDispatch ? undefined : "identity_not_verified",
  };
}

export function hasRequiredIdentityUploads(uploads: Upload[]) {
  return (
    uploads.some((upload) => upload.type === "driver_license") &&
    uploads.some((upload) => upload.type === "selfie_video")
  );
}

export function statusFromAiResult(result: IdentityAiResult): IdentityStatus {
  if (result.status === "verified") return "verified";
  if (result.status === "rejected") return "rejected";
  return "needs_review";
}
