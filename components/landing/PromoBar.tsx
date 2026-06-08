"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const PROMO_EXPIRY_KEY = "promo_expiry_ts";
const DURATION_MS = 24 * 60 * 60 * 1000;

function getOrCreateExpiry(): number {
  try {
    const stored = sessionStorage.getItem(PROMO_EXPIRY_KEY);
    if (stored) {
      const ts = Number(stored);
      if (ts > Date.now()) return ts;
    }
    const expiry = Date.now() + DURATION_MS;
    sessionStorage.setItem(PROMO_EXPIRY_KEY, String(expiry));
    return expiry;
  } catch {
    return Date.now() + DURATION_MS;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function PromoBar({ ctaUrl }: { ctaUrl: string }) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    const expiry = getOrCreateExpiry();
    const tick = () => setCountdown(formatCountdown(expiry - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-forest-800 text-white text-center text-xs sm:text-sm py-2.5 px-4">
      &#9889; <strong>47 patients</strong> started this week —{" "}
      {countdown ? (
        <>
          consultation fee waiver expires in{" "}
          <span className="font-mono text-red-300 font-bold">{countdown}</span>.{" "}
        </>
      ) : (
        "limited provider slots remain. "
      )}
      <Link
        href={ctaUrl}
        className="font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
      >
        Claim your spot →
      </Link>
    </div>
  );
}
