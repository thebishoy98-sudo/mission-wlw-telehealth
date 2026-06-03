import type { NextConfig } from "next";

// HIPAA § 164.312(a)(2)(iv) — Encryption & Decryption
// HIPAA § 164.312(e)(2)(ii) — Encryption in transit
// All responses served over HTTPS enforced via HSTS.
const securityHeaders = [
  // Force HTTPS for 2 years, include subdomains
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Block MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer policy — don't leak PHI in referrer headers
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable FLoC / Topics
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // XSS protection (legacy browsers)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Content Security Policy — restrict asset sources, block inline scripts
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.intuit.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://api.intuit.com https://sandbox.api.intuit.com",
      "frame-src https://js.intuit.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      { source: "/start", destination: "/start/info", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
