import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import * as quickbooks from "@/services/quickbooks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const info = await quickbooks.getCompanyInfo();
    return NextResponse.json({
      ok: true,
      realmId: process.env.QB_REALM_ID,
      companyName: info.CompanyInfo?.CompanyName ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 502 }
    );
  }
}
