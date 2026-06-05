"use client";
import Link from "next/link";

export function PromoBar({ ctaUrl }: { ctaUrl: string }) {
  return (
    <div className="bg-forest-800 text-white text-center text-xs sm:text-sm py-2.5 px-4">
      ⚡ <strong>47 patients</strong> started this week — limited provider slots remain.{" "}
      <Link
        href={ctaUrl}
        className="font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
      >
        Claim your spot →
      </Link>
    </div>
  );
}
