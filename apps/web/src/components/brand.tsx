import { cn } from '@/lib/utils'

/**
 * The receivable.eth mark: a square with the bottom-right corner cut away at 62%.
 * The cut is the point of the thing — a receivable is a claim that has been
 * partially released. Geometry is fixed by the brand sheet
 * (polygon 0 0, 100% 0, 100% 62%, 62% 100%, 0 100%) and must not be redrawn.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="presentation"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
      fill="currentColor"
    >
      <path d="M0 0h100v62L62 100H0Z" />
    </svg>
  )
}

/**
 * The mark on a rounded tile, as used for app icons and avatars.
 * Corner radius and mark size follow the 512px artboard (97/512, 236/512).
 */
export function MarkTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[18.95%] bg-accent text-bg',
        className,
      )}
    >
      <Mark className="h-[46.09%] w-[46.09%]" />
    </span>
  )
}

/** The wordmark on its own. `.eth` always carries the accent. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-mono font-bold tracking-[-0.045em]', className)}>
      receivable<span className="text-accent">.eth</span>
    </span>
  )
}

/**
 * Mark + wordmark, at the lockup proportions from the brand sheet
 * (mark 96 / wordmark 80 / gap 40 → mark 1.2em, gap 0.5em).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-[0.5em]', className)}>
      <Mark className="h-[1.2em] w-[1.2em] text-accent" />
      <Wordmark />
    </span>
  )
}
