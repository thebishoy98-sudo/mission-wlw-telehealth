type PaymentBypassEnv = {
  [key: string]: string | undefined;
  BYPASS_QB_PAYMENTS?: string;
  NEXT_PUBLIC_QB_PAYMENTS_ENABLED?: string;
};

function readBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function shouldBypassQuickBooksPayment(env: PaymentBypassEnv = process.env) {
  const explicitBypass = readBoolean(env.BYPASS_QB_PAYMENTS);
  if (explicitBypass !== null) return explicitBypass;

  return env.NEXT_PUBLIC_QB_PAYMENTS_ENABLED !== "true";
}
