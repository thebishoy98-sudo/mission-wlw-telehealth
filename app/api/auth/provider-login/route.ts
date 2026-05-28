import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (String(email).toLowerCase().trim() !== "dr.johnson@telehealth.com" || password !== "provider123") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true, role: "provider" });
  response.cookies.set("provider_secret", process.env.PROVIDER_SECRET ?? process.env.ADMIN_SECRET ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
