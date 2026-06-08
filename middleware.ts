import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/staff-session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin/* pages (not API routes — those use requireAdmin())
  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
    const session = verifyStaffSessionToken(token);
    if (!session || session.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login/admin";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Protect /provider/* pages
  if (pathname.startsWith("/provider")) {
    const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
    const session = verifyStaffSessionToken(token);
    if (!session || (session.role !== "provider" && session.role !== "admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login/provider";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/provider/:path*"],
};
