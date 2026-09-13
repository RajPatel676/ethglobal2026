'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Logo } from '@/components/brand'
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
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
        <Link
          href="/"
          aria-label="receivable.eth — home"
          className="flex items-center rounded-md"
        >
          <Logo className="text-[15px]" />
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-sand font-medium text-fg' : 'text-muted hover:bg-sand/70 hover:text-fg',
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </div>

        <div className="ml-auto">
          {isConnected && address ? (
            <button
              onClick={() => disconnect()}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-border-strong transition-colors hover:bg-sand"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
              <span className="font-mono">{shortHash(address, 4)}</span>
            </button>
          ) : (
            <button
              onClick={() => wallet && connect({ connector: wallet })}
              disabled={!wallet || isPending}
              title={wallet ? undefined : 'No browser wallet detected'}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPending ? 'Connecting…' : wallet ? 'Connect wallet' : 'No wallet found'}
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}
