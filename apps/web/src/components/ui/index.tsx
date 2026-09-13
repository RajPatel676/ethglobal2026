import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({
  className,
  children,
  as: As = 'div',
}: {
  className?: string
  children: ReactNode
  as?: 'div' | 'section'
}) {
  return (
    <As
      className={cn(
        'rounded-xl border border-border bg-surface shadow-card',
        !className?.includes('p-') && 'p-5',
        className,
      )}
    >
      {children}
    </As>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold tracking-tight">{children}</h2>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  )
}

/** Headline number. Money and counts only — keeps figures visually comparable across the app. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'accent'
}) {
  return (
    <div>
      <div className="text-2xs font-medium uppercase tracking-wider text-faint">{label}</div>
      <div
        className={cn(
          'tnum mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight',
          tone === 'accent' && 'text-accent',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
    </div>
  )
}

const TONES = {
  good: 'bg-good-soft text-good ring-good/15',
  warn: 'bg-warn-soft text-warn ring-warn/15',
  bad: 'bg-bad-soft text-bad ring-bad/15',
  neutral: 'bg-sand text-muted ring-border-strong/40',
  accent: 'bg-accent-soft text-accent ring-accent/15',
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
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

/** Maps the ENS `status` text record to a tone, so the whole app agrees what each state means. */
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
  const pct = max > 0n ? Math.min(100, Number((value * 100n) / max)) : 0
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-sand"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-6 py-10 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
    </Card>
  )
}

/**
 * Shown wherever a feature needs an address that has not been deployed yet. Naming the exact step
 * beats an empty list, which reads as a bug.
 */
export function NotConfigured({ what, step }: { what: string; step: string }) {
  return (
    <Card className="border-dashed border-border-strong bg-sand/50 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-faint" aria-hidden>
          ○
        </span>
        <div>
          <div className="text-sm font-semibold">{what} is not configured yet</div>
          <div className="mt-1 text-sm text-muted">
            Run <Code>{step}</Code>, then reload.
          </div>
        </div>
      </div>
    </Card>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="tnum min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-xs text-muted">{children}</span>
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-sand px-1.5 py-0.5 font-mono text-xs text-fg ring-1 ring-inset ring-border">
      {children}
    </code>
  )
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-hover shadow-card',
    secondary: 'bg-surface text-fg ring-1 ring-inset ring-border-strong hover:bg-sand',
    ghost: 'text-muted hover:bg-sand hover:text-fg',
  }[variant]
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
