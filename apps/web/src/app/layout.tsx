import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tá Barato — Entrega na sua casa',
  description: 'Marketplace local com entrega rápida em Vilhena-RO',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={dmSans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
