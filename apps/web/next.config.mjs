/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@nexusai/types', '@nexusai/ui'],
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
