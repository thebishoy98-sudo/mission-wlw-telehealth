import crypto from "crypto";
import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { createPatientSessionToken, PATIENT_SESSION_COOKIE } from "@/lib/patient-session";
import { normalizeSprucePhoneNumber } from "@/services/spruce.server";

function hashCode(phoneNumber: string, code: string) {
  const secret = process.env.PATIENT_OTP_SECRET ?? process.env.ADMIN_SECRET ?? "dev-patient-otp-secret";
  return crypto.createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const { phone, code } = await req.json().catch(() => ({}));
  const phoneNumber = normalizeSprucePhoneNumber(String(phone ?? ""));
  const submittedCode = String(code ?? "").replace(/\D/g, "");
  if (!phoneNumber || submittedCode.length !== 6) {
    return NextResponse.json({ error: "Enter the 6-digit code sent by text." }, { status: 400 });
  }

  const otp = await dbServer.patientLoginOtpDb.getActive(phoneNumber).catch(() => null);
  if (!otp) {
    return NextResponse.json({ error: "Code expired or invalid." }, { status: 401 });
  }
  if (Number(otp.attempts ?? 0) >= 5) {
    await dbServer.patientLoginOtpDb.consume(otp.id).catch(() => null);
    return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
  }

  const expectedHash = String(otp.code_hash ?? "");
  if (!safeEquals(hashCode(phoneNumber, submittedCode), expectedHash)) {
    await dbServer.patientLoginOtpDb.incrementAttempts(otp.id).catch(() => null);
    return NextResponse.json({ error: "Code expired or invalid." }, { status: 401 });
  }

  await dbServer.patientLoginOtpDb.consume(otp.id).catch(() => null);
  const patient = await dbServer.patientDb.getById(String(otp.patient_id)).catch(() => null);
  if (!patient) {
    return NextResponse.json({ error: "Patient account not found." }, { status: 404 });
  }

  const user = {
    id: `patient_session_${patient.id}`,
    name: [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient",
    email: patient.email,
    role: "patient",
    patientId: patient.id,
  };
  const response = NextResponse.json({ success: true, user });
  response.cookies.set(PATIENT_SESSION_COOKIE, createPatientSessionToken(patient.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
