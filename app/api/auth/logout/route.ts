import { NextResponse } from "next/server";
import { STAFF_SESSION_COOKIE } from "@/lib/staff-session";
import { PATIENT_SESSION_COOKIE } from "@/lib/patient-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set("admin_secret", "", { path: "/", maxAge: 0 });
  response.cookies.set("provider_secret", "", { path: "/", maxAge: 0 });
  response.cookies.set(PATIENT_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
