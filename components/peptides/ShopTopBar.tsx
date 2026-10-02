import Image from "next/image";
import Link from "next/link";

export function ShopTopBar() {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-forest-800 transition-colors">
          <Image
            src="/mission-logo-full.jpeg"
            alt="Mission Weight Loss & Wellness"
            width={140}
            height={44}
            className="h-7 w-auto object-contain"
          />
        </Link>
      </div>
    </div>
  );
}
