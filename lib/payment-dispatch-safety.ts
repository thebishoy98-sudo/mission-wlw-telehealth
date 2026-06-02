type PharmacySafetyEnv = {
  [key: string]: string | undefined;
  USE_REAL_INTEGRATIONS?: string;
  USE_REAL_LIFEFILE?: string;
  USE_REAL_APPSHEET?: string;
  LIFEFILE_ENVIRONMENT?: string;
  LIFEFILE_ORDER_ENDPOINT?: string;
  LF_ENDPOINT_ORDER_API?: string;
};

export function isRealPharmacyEnabled(pharmacyProvider: string, env: PharmacySafetyEnv = process.env) {
  const provider = pharmacyProvider.toLowerCase();
  if (provider === "lifefile" && isLifeFileSandbox(env)) return false;
  if (env.USE_REAL_INTEGRATIONS === "true") return true;
  if (provider === "lifefile") return env.USE_REAL_LIFEFILE === "true";
  if (provider === "appsheet") return env.USE_REAL_APPSHEET === "true";
  return false;
}

function isLifeFileSandbox(env: PharmacySafetyEnv) {
  const mode = env.LIFEFILE_ENVIRONMENT?.toLowerCase();
  const endpoint = `${env.LIFEFILE_ORDER_ENDPOINT ?? ""} ${env.LF_ENDPOINT_ORDER_API ?? ""}`.toLowerCase();
  return mode === "sandbox" || endpoint.includes("host100-7") || endpoint.includes("apitest");
}

export function canDispatchPharmacyAfterPayment({
  identityCanDispatch,
  paymentBypassed,
  realPharmacyEnabled,
}: {
  identityCanDispatch: boolean;
  paymentBypassed: boolean;
  realPharmacyEnabled: boolean;
}) {
  return identityCanDispatch && !(paymentBypassed && realPharmacyEnabled);
}

export type PracticeQAutomationAfterPaymentDecision =
  | "queue"
  | "skip_reorder"
  | "defer_identity";

export function getPracticeQAutomationAfterPaymentDecision({
  identityCanDispatch,
  checkoutIdentityReused,
}: {
  identityCanDispatch: boolean;
  checkoutIdentityReused: boolean;
}): PracticeQAutomationAfterPaymentDecision {
  if (checkoutIdentityReused) return "skip_reorder";
  if (!identityCanDispatch) return "defer_identity";
  return "queue";
}
