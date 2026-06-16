import crypto from "crypto";
import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { normalizeSprucePhoneNumber, sendTextToPhone } from "@/services/spruce.server";

function hashCode(phoneNumber: string, code: string) {
  const secret = process.env.PATIENT_OTP_SECRET ?? process.env.ADMIN_SECRET ?? "dev-patient-otp-secret";
  return crypto.createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}

// OTP sends bypass the normal sendMessage() logging, so log them explicitly —
// otherwise login-code delivery failures are completely invisible in the admin.
function logOtp(
  action: string,
  patientId: string | undefined,
  status: "success" | "pending" | "error",
  details: Record<string, unknown>,
  error?: string
) {
  return dbServer.integrationLogDb
    .create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action,
      patientId,
      status,
      details: { feature: "patient_login_otp", ...details },
      error,
    })
    .catch(() => {});
}

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const phoneNumber = normalizeSprucePhoneNumber(String(phone ?? ""));
  if (!phoneNumber) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  const patient = await dbServer.patientDb.getByPhone(phoneNumber).catch(() => null);
  if (!patient) {
    // Product decision: tell the user no prior order exists for this number
    // (rather than silently pretending a code was sent) so they aren't left
    // waiting and can be routed to start an intake. Trades a little
    // anti-enumeration privacy for a much clearer sign-in experience.
    await logOtp("Login code requested for unknown phone", undefined, "pending", { phone: phoneNumber });
    return NextResponse.json({ success: true, found: false });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  try {
    await dbServer.patientLoginOtpDb.create({
      id: generateId(),
      phoneNumber,
      patientId: patient.id,
      codeHash: hashCode(phoneNumber, code),
      expiresAt,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    await logOtp("Login code storage failed", patient.id, "error", { phone: phoneNumber }, (error as Error).message);
    return NextResponse.json({ error: "We couldn't start sign-in right now. Please try again shortly." }, { status: 500 });
  }

  try {
    const result = await sendTextToPhone(
      phoneNumber,
      `Your Mission WLW login code is ${code}. It expires in 10 minutes.`,
      `patient_login_${patient.id}_${now.getTime()}`
    );
    if ((result as { skipped?: boolean })?.skipped) {
      // USE_REAL_SPRUCE is not enabled — the patient will never receive a code.
      await logOtp("Login code NOT sent (Spruce disabled)", patient.id, "error", {
        phone: phoneNumber,
        reason: (result as { reason?: string }).reason,
      });
      return NextResponse.json(
        { error: "Text messaging is temporarily unavailable. Please contact support to sign in." },
        { status: 503 }
      );
    }
    await logOtp("Login code sent", patient.id, "success", { phone: phoneNumber });
    return NextResponse.json({ success: true });
  } catch (error) {
    await logOtp("Login code send failed", patient.id, "error", { phone: phoneNumber }, (error as Error).message);
    return NextResponse.json(
      { error: "We couldn't text your login code. Please try again, or contact support." },
      { status: 502 }
    );
  }
}
