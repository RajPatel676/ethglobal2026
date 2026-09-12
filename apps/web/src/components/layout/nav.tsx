'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { cn, shortHash } from '@/lib/utils'

const LINKS = [
  { href: '/dashboard', label: 'My invoices' },
  { href: '/market', label: 'Market' },
  { href: '/portfolio', label: 'Portfolio' },
]

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const wallet = connectors[0] // first EIP-6963 provider the browser announced

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          receivable<span className="text-accent">.eth</span>
        </Link>
        <div className="flex gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                pathname.startsWith(l.href) ? 'bg-white/5 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          {isConnected && address ? (
            <button
              onClick={() => disconnect()}
              className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-muted hover:text-fg"
            >
              {shortHash(address, 4)}
            </button>
          ) : (
            <button
              onClick={() => wallet && connect({ connector: wallet })}
              disabled={!wallet || isPending}
              title={wallet ? undefined : 'No browser wallet detected'}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? 'Connecting…' : wallet ? 'Connect wallet' : 'No wallet found'}
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}
