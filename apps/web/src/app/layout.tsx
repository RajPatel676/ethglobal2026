import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Nav } from '@/components/layout/nav'
import { Providers } from '@/components/layout/providers'
import './globals.css'

/**
 * Absolute base for og:image / twitter:image. Vercel injects VERCEL_URL for every deployment
 * (preview included) and VERCEL_PROJECT_PRODUCTION_URL for the stable production domain, so the
 * social card resolves correctly without hardcoding a host. NEXT_PUBLIC_SITE_URL overrides both
 * once there is a custom domain.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

const DESCRIPTION =
  'Invoice financing where the invoice stays private. Priced inside a TEE, named on ENS, registered against double financing on Hedera.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'receivable.eth — verified invoice financing',
  description: DESCRIPTION,
  applicationName: 'receivable.eth',
  openGraph: {
    type: 'website',
    siteName: 'receivable.eth',
    title: 'receivable.eth — verified invoice financing',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'receivable.eth — verified invoice financing',
    description: DESCRIPTION,
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
          <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4">
            <p className="border-t border-border pt-5 text-xs text-faint">
              Testnet demo · Sepolia + Hedera testnet · The invoice itself is never published, only a
              keccak fingerprint of it.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
