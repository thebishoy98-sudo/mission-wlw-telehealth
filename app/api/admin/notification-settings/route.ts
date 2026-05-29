import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import {
  getAdminNotificationSettings,
  saveAdminNotificationSettings,
} from "@/services/admin-notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const settings = await getAdminNotificationSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json();
  const settings = await saveAdminNotificationSettings(body);
  return NextResponse.json({ settings });
}
