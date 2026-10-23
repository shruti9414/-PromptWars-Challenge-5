import { useState } from 'react'

export interface Slice {
  id: string
  label: string
  value: number
  color: string
}

interface DonutProps {
  slices: Slice[]
  centerLabel: string
  centerValue: string
  format: (n: number) => string
  ariaLabel: string
}

const R = 70
const C = 2 * Math.PI * R

/**
 * Donut chart with an interactive legend. Hovering or focusing a legend row highlights its slice and
 * shows its value in the middle, so the same information is available without a pointer or colour vision.
 */
export function DonutChart({ slices, centerLabel, centerValue, format, ariaLabel }: DonutProps) {
  const [active, setActive] = useState<string | null>(null)
  const visible = slices.filter((s) => s.value > 0)
  const total = visible.reduce((a, s) => a + s.value, 0)
  const current = visible.find((s) => s.id === active)

  let offset = 0
  return (
    <div className="donut">
      <div className="donut__figure">
        <svg viewBox="0 0 200 200" role="img" aria-label={ariaLabel} className="donut__svg">
          <circle cx="100" cy="100" r={R} className="donut__base" />
          {total > 0 &&
            visible.map((s) => {
              const len = (s.value / total) * C
              const dim = active !== null && active !== s.id
              const circle = (
                <circle
                  key={s.id}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.id ? 30 : 24}
                  strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`}
                  strokeDashoffset={-offset}
                  opacity={dim ? 0.3 : 1}
                  transform="rotate(-90 100 100)"
                  className="donut__slice"
                  onMouseEnter={() => setActive(s.id)}
                  onMouseLeave={() => setActive(null)}
                />
              )
              offset += len
              return circle
            })}
        </svg>
        <div className="donut__center" aria-hidden="true">
          <span className="donut__center-label">{current ? current.label : centerLabel}</span>
          <span className="donut__center-value">{current ? format(current.value) : centerValue}</span>
        </div>
      </div>
      <ul className="legend">
        {visible.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="legend__item"
              aria-pressed={active === s.id}
              onMouseEnter={() => setActive(s.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.id)}
              onBlur={() => setActive(null)}
            >
              <span className="legend__dot" style={{ background: s.color }} aria-hidden="true" />
              <span className="legend__label">{s.label}</span>
              <span className="legend__value">{format(s.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BarRow {
  id: string
  label: string
  planned: number
  committed: number
  color: string
}

/** Horizontal bars comparing planned vs committed spend per category. Values are printed, not just drawn. */
export function CompareBars({ rows, format }: { rows: BarRow[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.planned, r.committed]))
  return (
    <ul className="bars" aria-label="Planned versus committed spend by category">
      {rows.map((r) => (
        <li key={r.id} className="bars__row">
          <div className="bars__head">
            <span className="bars__label">{r.label}</span>
            <span className="bars__nums">
              {format(r.committed)} <span className="muted">of {format(r.planned)}</span>
            </span>
          </div>
          <div className="bars__track" aria-hidden="true">
            <div className="bars__planned" style={{ width: `${(r.planned / max) * 100}%` }} />
            <div
              className={`bars__committed${r.committed > r.planned ? ' is-over' : ''}`}
              style={{ width: `${(r.committed / max) * 100}%`, background: r.committed > r.planned ? undefined : r.color }}
            />
          </div>
          {r.committed > r.planned && <p className="bars__flag">Over plan by {format(r.committed - r.planned)}</p>}
        </li>
      ))}
    </ul>
  )
}
