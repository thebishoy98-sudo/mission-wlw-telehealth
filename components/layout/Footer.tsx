import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12 sm:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-base font-bold text-white tracking-tight">Mission WLW</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Medical weight management with GLP-1 therapy. Board-certified providers, FDA-regulated pharmacies, direct-to-door delivery.
            </p>
            <a href="mailto:service@missionwlw.com" className="block mt-3 text-sm text-teal-400 hover:text-teal-300">
              service@missionwlw.com
            </a>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest text-gray-400">Programs</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/products" className="hover:text-white transition-colors">Weight Loss Program</Link></li>
              <li><Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
              <li><Link href="/#faq" className="hover:text-white transition-colors">FAQs</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest text-gray-400">Support</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/patient" className="hover:text-white transition-colors">My Orders</Link></li>
              <li><a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Dosage Instructions</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest text-gray-400">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Telehealth Consent</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-400 text-sm text-center sm:text-left">
            &copy; 2026 Mission Wellness &amp; Weight Loss. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <a href="https://instagram.com/missionwlw" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
            <a href="https://tiktok.com/@missionwlw" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TikTok</a>
            <a href="https://facebook.com/missionwlw" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Facebook</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
