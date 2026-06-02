import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { ClientFooter } from "@/components/layout/ClientFooter";
import { SeedInit } from "@/components/SeedInit";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mission Wellness & Weight Loss - Medical Weight Management",
  description:
    "GLP-1 medical weight loss programs with board-certified providers, FDA-regulated pharmacies, and free overnight shipping direct to your door.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-white`}>
        <AuthProvider>
          <SeedInit />
          <main className="min-h-screen">{children}</main>
          <ClientFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
