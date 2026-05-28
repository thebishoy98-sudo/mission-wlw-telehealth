import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (String(email).toLowerCase().trim() !== "admin@telehealth.com" || password !== "admin123") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true, role: "admin" });
  response.cookies.set("admin_secret", process.env.ADMIN_SECRET ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
