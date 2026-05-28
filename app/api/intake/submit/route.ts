import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy intake submission is disabled. Submit through /api/payments/charge so PracticeQ is only touched after payment succeeds.",
    },
    { status: 410 }
  );
}
