type SharedSecretValidationInput = {
  configuredSecret?: string | null;
  providedSecret?: string | null;
  serviceName: string;
  envName: string;
};

type SharedSecretValidationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function validateSharedSecret({
  configuredSecret,
  providedSecret,
  serviceName,
  envName,
}: SharedSecretValidationInput): SharedSecretValidationResult {
  if (!configuredSecret && process.env.VERCEL_ENV === "production") {
    console.error(`${envName} is not configured`);
    return {
      ok: false,
      status: 503,
      error: `${serviceName} webhook is not configured`,
    };
  }

  if (configuredSecret && providedSecret !== configuredSecret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
