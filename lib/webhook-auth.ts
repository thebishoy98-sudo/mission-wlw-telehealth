import { timingSafeEqual } from "crypto";

type SharedSecretValidationInput = {
  configuredSecret?: string | null;
  providedSecret?: string | null;
  serviceName: string;
  envName: string;
};

type SharedSecretValidationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

type BasicAuthValidationInput = {
  authorizationHeader?: string | null;
  configuredUsername?: string | null;
  configuredPassword?: string | null;
  serviceName: string;
};

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

export function validateBasicAuth({
  authorizationHeader,
  configuredUsername,
  configuredPassword,
  serviceName,
}: BasicAuthValidationInput): SharedSecretValidationResult {
  if ((!configuredUsername || !configuredPassword) && process.env.VERCEL_ENV === "production") {
    console.error(`${serviceName} Basic Auth credentials are not configured`);
    return {
      ok: false,
      status: 503,
      error: `${serviceName} webhook is not configured`,
    };
  }

  if (!configuredUsername || !configuredPassword) return { ok: true };
  const credentials = parseBasicAuth(authorizationHeader);
  if (!credentials) return { ok: false, status: 401, error: "Unauthorized" };

  if (
    !timingSafeStringEqual(credentials.username, configuredUsername) ||
    !timingSafeStringEqual(credentials.password, configuredPassword)
  ) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

function parseBasicAuth(authorizationHeader?: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function timingSafeStringEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
