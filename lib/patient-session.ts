import crypto from "crypto";

export const PATIENT_SESSION_COOKIE = "patient_session";

function sessionSecret() {
  return process.env.PATIENT_SESSION_SECRET ?? process.env.ADMIN_SECRET ?? "";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const rawValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!rawValue) return undefined;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function createPatientSessionToken(patientId: string) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ patientId, issuedAt }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyPatientSessionToken(token?: string | null) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      patientId?: string;
      issuedAt?: number;
    };
    if (!parsed.patientId || !parsed.issuedAt) return null;
    if (Date.now() - parsed.issuedAt > 30 * 24 * 60 * 60 * 1000) return null;
    return parsed.patientId;
  } catch {
    return null;
  }
}

export function getPatientIdFromRequest(req: Request) {
  return verifyPatientSessionToken(readCookie(req, PATIENT_SESSION_COOKIE));
}
