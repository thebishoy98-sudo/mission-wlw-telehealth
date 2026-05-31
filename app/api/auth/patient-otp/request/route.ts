import crypto from "crypto";
import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { normalizeSprucePhoneNumber, sendTextToPhone } from "@/services/spruce.server";

function hashCode(phoneNumber: string, code: string) {
  const secret = process.env.PATIENT_OTP_SECRET ?? process.env.ADMIN_SECRET ?? "dev-patient-otp-secret";
  return crypto.createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const phoneNumber = normalizeSprucePhoneNumber(String(phone ?? ""));
  if (!phoneNumber) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  const patient = await dbServer.patientDb.getByPhone(phoneNumber).catch(() => null);
  if (!patient) {
    return NextResponse.json({ success: true });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await dbServer.patientLoginOtpDb.create({
    id: generateId(),
    phoneNumber,
    patientId: patient.id,
    codeHash: hashCode(phoneNumber, code),
    expiresAt,
    createdAt: now.toISOString(),
  });

  await sendTextToPhone(
    phoneNumber,
    `Your Mission WLW login code is ${code}. It expires in 10 minutes.`,
    `patient_login_${patient.id}_${now.getTime()}`
  );

  return NextResponse.json({ success: true });
}
