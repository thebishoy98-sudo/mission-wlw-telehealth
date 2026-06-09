/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      { source: "/start", destination: "/start/info", permanent: false },
      { source: "/weight-loss-program", destination: "/products", permanent: false },
      { source: "/pricing", destination: "/#pricing", permanent: false },
      { source: "/support", destination: "/#faq", permanent: false },
    ];
  },
};

module.exports = nextConfig;
