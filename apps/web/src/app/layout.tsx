import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Nav } from '@/components/layout/nav'
import { Providers } from '@/components/layout/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'receivable.eth',
  description: 'Verified, tokenized invoice financing for small businesses.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
