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
  // Headers de segurança seguros (não quebram MP/Google): anti-clickjacking,
  // anti-MIME-sniffing e vazamento de referrer. Uma CSP com script-src/connect-src
  // completa exige um passo de teste à parte (pra não bloquear MP/Google/API).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
