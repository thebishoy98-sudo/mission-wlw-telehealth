import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_secret", "", { path: "/", maxAge: 0 });
  response.cookies.set("provider_secret", "", { path: "/", maxAge: 0 });
  return response;
}
