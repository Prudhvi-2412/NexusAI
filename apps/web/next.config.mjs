/** @type {import('next').NextConfig} */
const apiOrigin = process.env.NEXUS_API_ORIGIN?.replace(/\/+$/, '');
if (apiOrigin) {
  const parsedApiOrigin = new URL(apiOrigin);
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedApiOrigin.hostname);
  if (parsedApiOrigin.pathname !== '/' || parsedApiOrigin.search || parsedApiOrigin.hash
      || parsedApiOrigin.username || parsedApiOrigin.password
      || (parsedApiOrigin.protocol !== 'https:' && !(parsedApiOrigin.protocol === 'http:' && isLoopback))) {
    throw new Error('NEXUS_API_ORIGIN must be an HTTPS origin (HTTP is allowed only for loopback development)');
  }
}

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@nexusai/types', '@nexusai/ui'],
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
