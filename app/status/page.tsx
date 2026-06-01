import { redirect } from "next/navigation";

export default function PatientStatus() {
  redirect("/login/patient?next=/patient");
}
