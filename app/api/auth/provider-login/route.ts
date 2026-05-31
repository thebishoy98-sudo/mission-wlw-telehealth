import { NextResponse } from "next/server";
import crypto from "crypto";

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const configuredEmail = process.env.PROVIDER_EMAIL ?? "";
  const configuredPassword = process.env.PROVIDER_PASSWORD ?? "";
  const providerSecret = process.env.PROVIDER_SECRET ?? process.env.ADMIN_SECRET;
  const providerName = process.env.PROVIDER_NAME ?? "Dotson, Karen";

  if (!configuredEmail || !configuredPassword || !providerSecret) {
    return NextResponse.json({ error: "Provider login is not configured" }, { status: 500 });
  }

  const submittedEmail = String(email).toLowerCase().trim();
  const submittedPassword = String(password ?? "");
  if (submittedEmail !== configuredEmail.toLowerCase().trim() || !safeEquals(submittedPassword, configuredPassword)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    role: "provider",
    user: {
      id: "provider_session",
      name: providerName,
      email: configuredEmail,
      role: "provider",
    },
  });
  response.cookies.set("provider_secret", providerSecret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
