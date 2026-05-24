export interface StripeIdentityConfig {
  secretKey: string;
  appUrl: string;
}

export interface StripeIdentitySessionInput {
  orderId: string;
  patientId: string;
  returnUrl: string;
  email?: string;
}

export interface StripeIdentitySession {
  id: string;
  url: string;
  status?: string;
}

export function getStripeIdentityConfig(): StripeIdentityConfig {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.VERCEL_PROJECT_PRODUCTION_URL ??
      "",
  };
}

export function isStripeIdentityConfigured(config = getStripeIdentityConfig()) {
  return !!config.secretKey && !!config.appUrl;
}

export function buildStripeIdentitySessionParams(input: StripeIdentitySessionInput) {
  const params = new URLSearchParams();
  params.set("type", "document");
  params.set("options[document][require_matching_selfie]", "true");
  params.set("metadata[order_id]", input.orderId);
  params.set("metadata[patient_id]", input.patientId);
  params.set("return_url", input.returnUrl);
  if (input.email) params.set("provided_details[email]", input.email);
  return params;
}

export async function createStripeIdentitySession(
  input: StripeIdentitySessionInput,
  config = getStripeIdentityConfig()
): Promise<StripeIdentitySession> {
  if (!isStripeIdentityConfigured(config)) {
    throw new Error("Stripe Identity is not configured.");
  }

  const response = await fetch("https://api.stripe.com/v1/identity/verification_sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: buildStripeIdentitySessionParams(input),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Stripe Identity session creation failed.");
  }

  if (!payload?.id || !payload?.url) {
    throw new Error("Stripe Identity returned an incomplete session.");
  }

  return {
    id: payload.id,
    url: payload.url,
    status: payload.status,
  };
}
