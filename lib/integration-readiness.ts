type EnvLike = Record<string, string | undefined>;

export type SpruceReadiness = {
  liveSending: boolean;
  configured: boolean;
  hasPhoneEndpoint: boolean;
  ready: boolean;
  problems: string[];
  webhookPath: string;
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function getSpruceReadiness(env: EnvLike = process.env): SpruceReadiness {
  const liveSending = env.USE_REAL_SPRUCE === "true";
  const configured = hasValue(env.SPRUCE_AUTH_TOKEN) ||
    (hasValue(env.SPRUCE_ACCESS_ID) && hasValue(env.SPRUCE_API_KEY));
  const hasPhoneEndpoint = hasValue(env.SPRUCE_INTERNAL_ENDPOINT_ID);
  const problems: string[] = [];

  if (!liveSending) problems.push("USE_REAL_SPRUCE is not true");
  if (!configured) problems.push("Spruce credentials are missing");
  if (!hasPhoneEndpoint) problems.push("SPRUCE_INTERNAL_ENDPOINT_ID is missing");

  return {
    liveSending,
    configured,
    hasPhoneEndpoint,
    ready: liveSending && configured && hasPhoneEndpoint,
    problems,
    webhookPath: "/api/webhooks/spruce",
  };
}
