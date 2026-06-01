type PharmacySafetyEnv = {
  [key: string]: string | undefined;
  USE_REAL_INTEGRATIONS?: string;
  USE_REAL_LIFEFILE?: string;
  USE_REAL_APPSHEET?: string;
};

export function isRealPharmacyEnabled(pharmacyProvider: string, env: PharmacySafetyEnv = process.env) {
  const provider = pharmacyProvider.toLowerCase();
  if (env.USE_REAL_INTEGRATIONS === "true") return true;
  if (provider === "lifefile") return env.USE_REAL_LIFEFILE === "true";
  if (provider === "appsheet") return env.USE_REAL_APPSHEET === "true";
  return false;
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
