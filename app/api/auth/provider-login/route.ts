import { NextRequest, NextResponse } from "next/server";

const FALLBACK_PROVIDER_EMAIL = "dr.johnson@telehealth.com";
const FALLBACK_PROVIDER_PASSWORD = "provider123";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  const expectedEmail = (process.env.PROVIDER_EMAIL ?? FALLBACK_PROVIDER_EMAIL).trim().toLowerCase();
  const expectedPassword = process.env.PROVIDER_PASSWORD ?? FALLBACK_PROVIDER_PASSWORD;

  if (normalizedEmail !== expectedEmail || password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const providerSecret = process.env.PROVIDER_SECRET ?? process.env.ADMIN_SECRET;
  if (!providerSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "PROVIDER_SECRET or ADMIN_SECRET is not configured." }, { status: 500 });
  }

  const response = NextResponse.json({
    user: {
      id: "provider_session",
      name: "Dr. Sarah Johnson",
      email: expectedEmail,
      role: "provider",
    },
  });

  if (providerSecret) {
    response.cookies.set("provider_secret", providerSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  return response;
}
