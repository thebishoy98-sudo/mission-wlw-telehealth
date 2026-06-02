"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function ClientFooter() {
  const pathname = usePathname();
  // Landing page has its own inline footer — suppress the global one
  if (pathname === "/") return null;
  return <Footer />;
}
