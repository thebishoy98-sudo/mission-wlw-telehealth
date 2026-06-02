"use client";
import Link from "next/link";

export function PromoBar({ ctaUrl }: { ctaUrl: string }) {
  return (
    <div className="bg-forest-800 text-white text-center text-xs sm:text-sm py-2.5 px-4">
      Free provider consultation included this month —{" "}
      <Link
        href={ctaUrl}
        className="font-semibold underline underline-offset-2 hover:text-green-200 transition-colors"
      >
        Claim your spot →
      </Link>
    </div>
  );
}
