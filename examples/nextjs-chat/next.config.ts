import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hpkv/zustand-multiplayer'],
};

export default nextConfig;
