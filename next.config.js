/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workflow + AI SDK packages need to be transpiled in some setups
  transpilePackages: [],
};

module.exports = nextConfig;
