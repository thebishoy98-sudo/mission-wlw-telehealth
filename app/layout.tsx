import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { ClientFooter } from "@/components/layout/ClientFooter";
import { SeedInit } from "@/components/SeedInit";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://missionwlw.com"),
  title: "Mission Wellness & Weight Loss - Medical Weight Management",
  description:
    "GLP-1 medical weight loss programs with board-certified providers, FDA-regulated pharmacies, and free overnight shipping direct to your door.",
  openGraph: {
    title: "Mission Wellness & Weight Loss",
    description:
      "Medical weight management reviewed by licensed providers and fulfilled through FDA-regulated pharmacies.",
    url: "https://missionwlw.com",
    siteName: "Mission Wellness & Weight Loss",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mission Wellness & Weight Loss",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mission Wellness & Weight Loss",
    description:
      "Medical weight management reviewed by licensed providers and fulfilled through FDA-regulated pharmacies.",
    images: ["/og-image.png"],
  },
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
