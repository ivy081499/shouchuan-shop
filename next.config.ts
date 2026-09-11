import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // OpenNext 會處理 Cloudflare Workers 的轉譯
  images: {
    // R2 公開網域，部署時由環境變數提供
    remotePatterns: [{ protocol: 'https', hostname: '**.r2.dev' }],
  },
}

export default nextConfig
