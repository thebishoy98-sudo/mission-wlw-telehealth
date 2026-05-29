import { NextResponse } from "next/server";
import crypto from "crypto";

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const configuredEmail = process.env.ADMIN_EMAIL ?? "";
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!configuredEmail || !configuredPassword || !process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin login is not configured" }, { status: 500 });
  }

  const submittedEmail = String(email).toLowerCase().trim();
  const submittedPassword = String(password ?? "");
  if (submittedEmail !== configuredEmail.toLowerCase().trim() || !safeEquals(submittedPassword, configuredPassword)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    role: "admin",
    user: {
      id: "admin_session",
      name: "Admin User",
      email: configuredEmail,
      role: "admin",
    },
  });
  response.cookies.set("admin_secret", process.env.ADMIN_SECRET, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
