import { NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/promo-code.server";

export async function POST(req: Request) {
  const { code, baseAmount } = await req.json().catch(() => ({}));
  const result = await validatePromoCode(String(code ?? ""), Number(baseAmount));
  return result.valid
    ? NextResponse.json(result)
    : NextResponse.json(result, { status: 400 });
}
