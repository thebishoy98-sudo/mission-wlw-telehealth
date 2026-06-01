import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";
import { getStaffSessionFromRequest } from "@/lib/staff-session";

export async function GET(req: Request) {
  const staff = getStaffSessionFromRequest(req);
  if (staff) {
    return NextResponse.json({
      user: {
        id: `${staff.role}_session`,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
    });
  }

  const patientId = getPatientIdFromRequest(req);
  if (!patientId) {
    return NextResponse.json({ user: null });
  }

  const patient = await dbServer.patientDb.getById(patientId).catch(() => null);
  if (!patient) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: `patient_session_${patient.id}`,
      name: [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient",
      email: patient.email,
      role: "patient",
      patientId: patient.id,
    },
  });
}
