"use client";
import Link from "next/link";
import Image from "next/image";

const LINKS = {
  Program: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Reviews", href: "#reviews" },
    { label: "FAQ", href: "#faq" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Telehealth Consent", href: "/consent" },
    { label: "HIPAA Notice", href: "/privacy#hipaa" },
  ],
  Account: [
    { label: "Patient Login", href: "/login/patient" },
    { label: "Start Assessment", href: "/start/info" },
    { label: "Order History", href: "/patient" },
    { label: "Dosage Instructions", href: "/dosage" },
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
            Start Free Assessment
          </Link>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Image
              src="/mission-logo-icon.jpeg"
              alt="Mission Weight Loss and Wellness"
              width={48}
              height={48}
              className="w-10 h-10 object-contain rounded-lg mb-4"
            />
            <p className="text-sm text-white/55 leading-relaxed mb-4">
              Board-certified providers. FDA-regulated compounded Tirzepatide.
              Delivered to your door.
            </p>
            <a
              href="mailto:service@missionwlw.com"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              service@missionwlw.com
            </a>
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
            <strong className="text-white/50">Important Safety Information:</strong> Tirzepatide is
            a prescription medication requiring a medical evaluation. Results vary. Compounded
            Tirzepatide is prepared by a US-based pharmacy and is not an FDA-approved drug
            product. Mission Weight Loss and Wellness is a telehealth platform connecting patients
            with independent licensed providers.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[11px] text-white/30">
              &copy; {new Date().getFullYear()} Mission Weight Loss and Wellness. All rights reserved.
            </p>
            <div className="flex gap-4">
              <a href="https://instagram.com/missionwlw" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/40 hover:text-white transition-colors">Instagram</a>
              <a href="https://tiktok.com/@missionwlw" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/40 hover:text-white transition-colors">TikTok</a>
              <a href="https://facebook.com/missionwlw" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/40 hover:text-white transition-colors">Facebook</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
