import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-5', className)}>{children}</div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  )
}

const TONES = {
  good: 'bg-good/10 text-good border-good/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  bad: 'bg-bad/10 text-bad border-bad/30',
  neutral: 'bg-white/5 text-muted border-border',
  accent: 'bg-accent/10 text-accent border-accent/30',
} as const

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

/** Maps the ENS `status` text record to a colour, so the whole app agrees on what each means. */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'financed' || status === 'settled'
      ? 'good'
      : status === 'verified'
        ? 'accent'
        : status === 'rejected'
          ? 'bad'
          : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

export function Progress({ value, max }: { value: bigint; max: bigint }) {
  const pct = max > 0n ? Number((value * 100n) / max) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center">
      <div className="text-sm font-medium">{title}</div>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </Card>
  )
}

/**
 * Shown wherever a feature needs an address that has not been deployed yet. Being explicit about
 * *which* step is missing beats an empty list that looks like a bug.
 */
export function NotConfigured({ what, step }: { what: string; step: string }) {
  return (
    <Card className="border-dashed">
      <div className="text-sm font-medium">{what} is not configured yet</div>
      <div className="mt-1 text-sm text-muted">
        Run <code className="rounded bg-white/5 px-1 font-mono text-xs">{step}</code>, then reload.
      </div>
    </Card>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm tabular-nums">{children}</span>
    </div>
  )
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>
}
