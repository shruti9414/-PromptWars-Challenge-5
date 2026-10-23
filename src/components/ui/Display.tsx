import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

type Tone = 'neutral' | 'violet' | 'blue' | 'ok' | 'warn' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

/** Labels content that is simulated in Phase 1 so nobody mistakes it for live data. */
export function DemoTag({ children = 'Demo data' }: { children?: ReactNode }) {
  return <span className="demo-tag">{children}</span>
}

interface ProgressProps {
  value: number
  label: string
  tone?: 'violet' | 'blue' | 'ok' | 'warn' | 'danger'
  showValue?: boolean
}

export function ProgressBar({ value, label, tone = 'violet', showValue }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="progress">
      <div className="progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`progress__fill progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="progress__value">{pct}%</span>}
    </div>
  )
}

/** Circular progress. The percentage is always printed in the centre so it is not colour-only. */
export function ProgressRing({ value, label, caption }: { value: number; label: string; caption: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <figure className="ring" aria-label={`${label}: ${pct}%`}>
      <svg viewBox="0 0 80 80" className="ring__svg" aria-hidden="true">
        <circle cx="40" cy="40" r={r} className="ring__track" />
        <circle cx="40" cy="40" r={r} className="ring__fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 40 40)" />
      </svg>
      <span className="ring__value">{pct}%</span>
      <figcaption className="ring__caption">{caption}</figcaption>
    </figure>
  )
}

export function EmptyState({
  icon = 'sparkles', title, children, action, level = 2,
}: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; level?: 1 | 2 | 3 }) {
  // The heading level is chosen by the caller so the page outline never skips a level or lacks an h1.
  const Heading = `h${level}` as const
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={26} /></span>
      <Heading className="empty__title">{title}</Heading>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({
  eyebrow, title, children, actions,
}: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-head__title">{title}</h1>
        {children && <p className="page-head__sub">{children}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function StatCard({
  label, value, note, tone,
}: { label: string; value: ReactNode; note?: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value}</p>
      {note && <p className="stat__note">{note}</p>}
    </div>
  )
}

/** Group of toggle chips used for filters. Each chip exposes aria-pressed. */
export function FilterChips<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
