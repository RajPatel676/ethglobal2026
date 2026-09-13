import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Nav } from '@/components/layout/nav'
import { Providers } from '@/components/layout/providers'
import './globals.css'

const DESCRIPTION =
  'Invoice financing where the invoice stays private. Priced inside a TEE, named on ENS, registered against double financing on Hedera.'

export const metadata: Metadata = {
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
