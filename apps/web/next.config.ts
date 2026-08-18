import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.storage.co' },
    ],
    // Padrão (75) só pra miniaturas — capa da loja, lightbox e foto principal
    // do produto pedem qualidade mais alta pra não ficar borrada.
    qualities: [75, 90, 92, 95],
  },
}

export default nextConfig
