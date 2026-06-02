"use client";
import Link from "next/link";
import Image from "next/image";

const LINKS = {
  Program: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Medications", href: "#pricing" },
    { label: "Pricing", href: "#pricing" },
    { label: "Reviews", href: "#reviews" },
    { label: "FAQ", href: "#faq" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "HIPAA Notice", href: "/hipaa" },
    { label: "Accessibility", href: "/accessibility" },
  ],
  Account: [
    { label: "Patient Login", href: "/login" },
    { label: "Start Assessment", href: "/start/info" },
    { label: "Track My Order", href: "/orders" },
    { label: "Contact Support", href: "/contact" },
  ],
};

export function LandingFooter({ ctaUrl }: { ctaUrl: string }) {
  return (
    <footer className="bg-forest-800 text-white">
      {/* CTA band */}
      <div className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold mb-1">Ready to start your journey?</h3>
            <p className="text-sm text-white/60">Free consultation included this month.</p>
          </div>
          <Link
            href={ctaUrl}
            className="bg-white text-forest-800 hover:bg-cream-200 font-bold px-7 py-3.5 rounded-full transition-colors whitespace-nowrap active:scale-[.98] shrink-0"
          >
            Start Free Assessment →
          </Link>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Image
              src="/mission-logo.jpeg"
              alt="Mission Weight Loss & Wellness"
              width={120}
              height={40}
              className="h-10 w-auto object-contain mb-4 brightness-0 invert"
            />
            <p className="text-sm text-white/55 leading-relaxed mb-4">
              Board-certified providers. FDA-approved medications.
              Delivered to your door.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <span>🔒 HIPAA Compliant</span>
            </div>
          </div>

          {/* Links */}
          {Object.entries(LINKS).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">{group}</h4>
              <ul className="space-y-2.5">
                {items.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-white/65 hover:text-white transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 space-y-3">
          <p className="text-[11px] text-white/35 leading-relaxed">
            <strong className="text-white/50">Important Safety Information:</strong> GLP-1 medications are
            prescription-only and require a medical evaluation. Results vary. These medications may not be
            appropriate for everyone. Compounded medications are not FDA-approved but are prepared by
            licensed 503B compounding pharmacies. Mission Weight Loss & Wellness is a telehealth platform
            connecting patients with independent licensed providers.
          </p>
          <p className="text-[11px] text-white/30">
            © {new Date().getFullYear()} Mission Weight Loss & Wellness. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
