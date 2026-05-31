import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const remoteBase = process.env.PRACTICEQ_REMOTE_PUBLIC_URL;
  const apiKey = process.env.PRACTICEQ_API_KEY;

  if (!remoteBase || !apiKey) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: !remoteBase ? "PRACTICEQ_REMOTE_PUBLIC_URL is missing" : "PRACTICEQ_API_KEY is missing",
    });
  }

  const timeoutMs = Number(process.env.PRACTICEQ_REMOTE_WAKE_TIMEOUT_MS ?? 90000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("/wake", remoteBase).toString(), {
      method: "POST",
      cache: "no-store",
      headers: { "x-practiceq-api-key": apiKey },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ ok: response.ok, status: response.status, remote: payload });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "PracticeQ wake failed",
    }, { status: 202 });
  } finally {
    clearTimeout(timeout);
  }
}
