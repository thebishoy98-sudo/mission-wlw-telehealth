import crypto from "crypto";

export const STAFF_SESSION_COOKIE = "staff_session";

export type StaffSessionRole = "admin" | "provider";

export type StaffSession = {
  role: StaffSessionRole;
  email: string;
  name: string;
  issuedAt: number;
};

const STAFF_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function sessionSecret() {
  return (
    process.env.STAFF_SESSION_SECRET ??
    process.env.ADMIN_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "dev-staff-session-secret"
  );
}

function sign(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers?.get?.("cookie") ?? "";
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

export function createStaffSessionToken(input: Omit<StaffSession, "issuedAt">) {
  const payload = Buffer.from(
    JSON.stringify({ ...input, issuedAt: Date.now() }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyStaffSessionToken(token?: string | null): StaffSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEquals(signature, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffSession;
    if (parsed.role !== "admin" && parsed.role !== "provider") return null;
    if (!parsed.email || !parsed.name || !parsed.issuedAt) return null;
    if (Date.now() - parsed.issuedAt > STAFF_SESSION_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStaffSessionFromRequest(req: Request) {
  return verifyStaffSessionToken(readCookie(req, STAFF_SESSION_COOKIE));
}
