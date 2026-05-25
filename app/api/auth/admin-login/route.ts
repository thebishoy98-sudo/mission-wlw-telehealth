import { NextRequest, NextResponse } from "next/server";

const FALLBACK_ADMIN_EMAIL = "admin@telehealth.com";
const FALLBACK_ADMIN_PASSWORD = "admin123";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  const expectedEmail = (process.env.ADMIN_EMAIL ?? FALLBACK_ADMIN_EMAIL).trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD ?? FALLBACK_ADMIN_PASSWORD;

  if (normalizedEmail !== expectedEmail || password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!process.env.ADMIN_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "ADMIN_SECRET is not configured." }, { status: 500 });
  }

  const response = NextResponse.json({
    user: {
      id: "admin_session",
      name: "Admin User",
      email: expectedEmail,
      role: "admin",
    },
  });

  if (process.env.ADMIN_SECRET) {
    response.cookies.set("admin_secret", process.env.ADMIN_SECRET, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  return response;
}
