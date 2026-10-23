import { useMemo } from 'react'
import { SelectField, TextAreaField, TextField } from '../../components/ui/Fields'
import { DemoTag } from '../../components/ui/Display'
import { CATEGORY_BY_ID, EVENT_TYPES, EVENT_TYPE_LABEL, MAX_PRIORITIES, PREFERENCES, PRIORITY_OPTIONS, THEMES, VENUE_STATUS_LABEL } from '../../data/constants'
import { formatDate } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { suggestedSplit } from '../../lib/planner'
import { LIMITS, parseNumber } from '../../lib/validation'
import type { FieldErrors } from '../../lib/validation'
import { useSettings } from '../../state/store'
import type { EventDraft, VenueStatus } from '../../types'

type OnChange = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void
interface StepProps { draft: EventDraft; errors: FieldErrors<EventDraft> }

export function TypeStep({ draft, errors, onPick }: StepProps & { onPick: (t: EventDraft['type']) => void }) {
  return (
    <fieldset className="fieldset">
      <legend className="sr-only">Event type</legend>
      <div className="type-grid">
        {EVENT_TYPES.map((t) => (
          <label key={t.id} className={`type-card${draft.type === t.id ? ' is-selected' : ''}`}>
            <input type="radio" name="event-type" value={t.id} checked={draft.type === t.id} onChange={() => onPick(t.id)} className="sr-only-input" />
            <img src={t.image} alt="" loading="lazy" width="400" height="260" />
            <span className="type-card__body">
              <span className="type-card__title">{t.label}</span>
              <span className="type-card__text">{t.tagline}</span>
            </span>
          </label>
        ))}
      </div>
      {errors.type && <p className="field__error" role="alert">{errors.type}</p>}
    </fieldset>
  )
}

export function DetailsStep({
  draft, errors, today, allowPast, onChange,
}: StepProps & { today: string; allowPast: boolean; onChange: OnChange }) {
  return (
    <div className="form-grid">
      <TextField
        className="span-2" label="Event name" required value={draft.name} maxLength={LIMITS.name.max + 20}
        placeholder="e.g. Aarav & Meera's Wedding" error={errors.name} autoComplete="off"
        onChange={(e) => onChange('name', e.target.value)}
      />
      <TextField
        label="Date" type="date" required value={draft.date} min={allowPast ? undefined : today} max="2100-12-31"
        error={errors.date} onChange={(e) => onChange('date', e.target.value)}
      />
      <TextField
        label="Expected guests" required inputMode="numeric" value={draft.guestCount} placeholder="e.g. 120"
        hint={`Between ${LIMITS.guests.min} and ${LIMITS.guests.max}.`} error={errors.guestCount} autoComplete="off"
        onChange={(e) => onChange('guestCount', e.target.value)}
      />
      <TextField
        className="span-2" label="Location" required value={draft.location} maxLength={LIMITS.location.max + 20}
        placeholder="City or venue" error={errors.location} autoComplete="off"
        onChange={(e) => onChange('location', e.target.value)}
      />
    </div>
  )
}

export function BudgetStep({ draft, errors, onChange }: StepProps & { onChange: OnChange }) {
  const { currency } = useSettings()
  const budget = parseNumber(draft.budget)
  const split = useMemo(
    () => (draft.type && budget !== null && Number.isInteger(budget) && budget >= LIMITS.budget.min && budget <= LIMITS.budget.max ? suggestedSplit(draft.type, budget) : null),
    [draft.type, budget],
  )
  return (
    <div className="stack">
      <TextField
        label="Total budget" required inputMode="numeric" value={draft.budget} placeholder="e.g. 500000"
        hint={`In ${currency}. Change the currency under Settings.`} error={errors.budget} autoComplete="off"
        onChange={(e) => onChange('budget', e.target.value)}
      />
      {split && draft.type && (
        <div className="split" aria-label="Suggested budget split">
          <div className="split__head">
            <h3 className="split__title">Suggested split for a {EVENT_TYPE_LABEL[draft.type].toLowerCase()}</h3>
            <DemoTag>Rule-based starter</DemoTag>
          </div>
          <div className="split__bar" aria-hidden="true">
            {split.map((s) => (
              <span key={s.category} style={{ flex: s.pct, background: CATEGORY_BY_ID[s.category].color }} />
            ))}
          </div>
          <ul className="split__list">
            {split.map((s) => (
              <li key={s.category}>
                <span className="legend__dot" style={{ background: CATEGORY_BY_ID[s.category].color }} aria-hidden="true" />
                {CATEGORY_BY_ID[s.category].label}
                <strong>{formatMoney(s.amount, currency, true)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="fieldset">
        <legend className="field__label">Theme <span className="field__req" aria-hidden="true">*</span></legend>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <label key={t.id} className={`theme-card${draft.theme === t.id ? ' is-selected' : ''}`}>
              <input type="radio" name="theme" value={t.id} checked={draft.theme === t.id} onChange={() => onChange('theme', t.id)} className="sr-only-input" />
              <span className="theme-card__swatches" aria-hidden="true">
                {t.swatches.map((c) => <span key={c} style={{ background: c }} />)}
              </span>
              <span className="theme-card__title">{t.label}</span>
              <span className="theme-card__text">{t.blurb}</span>
            </label>
          ))}
        </div>
        {errors.theme && <p className="field__error" role="alert">{errors.theme}</p>}
      </fieldset>
    </div>
  )
}

export function PreferencesStep({
  draft, errors, editing, onChange,
}: StepProps & { editing: boolean; onChange: OnChange }) {
  const { currency } = useSettings()
  const toggle = (p: string) =>
    onChange('preferences', draft.preferences.includes(p) ? draft.preferences.filter((x) => x !== p) : [...draft.preferences, p])
  const theme = THEMES.find((t) => t.id === draft.theme)
  const togglePriority = (p: string) => {
    if (draft.priorities.includes(p)) onChange('priorities', draft.priorities.filter((x) => x !== p))
    else if (draft.priorities.length < MAX_PRIORITIES) onChange('priorities', [...draft.priorities, p])
  }
  return (
    <div className="stack">
      <SelectField label="Venue status" value={draft.venueStatus || 'not-started'} error={errors.venueStatus} hint="Helps the planner decide how much to budget for the venue." onChange={(e) => onChange('venueStatus', e.target.value as VenueStatus)}>
        {(Object.keys(VENUE_STATUS_LABEL) as VenueStatus[]).map((v) => <option key={v} value={v}>{VENUE_STATUS_LABEL[v]}</option>)}
      </SelectField>

      <fieldset className="fieldset">
        <legend className="field__label">Planning priorities <span className="field__hint-inline">(pick up to ${MAX_PRIORITIES}, optional)</span></legend>
        <div className="chips chips--wrap">
          {PRIORITY_OPTIONS.map((p) => {
            const on = draft.priorities.includes(p.id)
            return (
              <label key={p.id} className={`chip chip--check${on ? ' is-on' : ''}`}>
                <input type="checkbox" checked={on} disabled={!on && draft.priorities.length >= MAX_PRIORITIES} onChange={() => togglePriority(p.id)} className="sr-only-input" />
                {p.id}
              </label>
            )
          })}
        </div>
        {errors.priorities && <p className="field__error" role="alert">{errors.priorities}</p>}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="field__label">Preferences <span className="field__hint-inline">(optional)</span></legend>
        <div className="chips chips--wrap">
          {PREFERENCES.map((p) => (
            <label key={p} className={`chip chip--check${draft.preferences.includes(p) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={draft.preferences.includes(p)} onChange={() => toggle(p)} className="sr-only-input" />
              {p}
            </label>
          ))}
        </div>
        {errors.preferences && <p className="field__error" role="alert">{errors.preferences}</p>}
      </fieldset>

      <TextAreaField
        label="Notes" value={draft.notes} rows={3} maxLength={LIMITS.notes + 50}
        hint={`${draft.notes.length}/${LIMITS.notes}. Anything vendors or helpers should know.`} error={errors.notes}
        onChange={(e) => onChange('notes', e.target.value)}
      />

      {!editing && (
        <label className="check-row">
          <input type="checkbox" checked={draft.useSuggestedPlan} onChange={(e) => onChange('useSuggestedPlan', e.target.checked)} />
          <span>
            <strong>Start with a suggested plan</strong>
            <span className="muted"> Adds budget lines, timeline tasks and a vendor checklist from a built-in template. Rule-based; you can edit everything.</span>
          </span>
        </label>
      )}

      <section className="review" aria-label="Review your event">
        <h3 className="review__title">Review</h3>
        <dl className="review__list">
          <div><dt>Type</dt><dd>{draft.type ? EVENT_TYPE_LABEL[draft.type] : '-'}</dd></div>
          <div><dt>Name</dt><dd>{draft.name || '-'}</dd></div>
          <div><dt>Date</dt><dd>{draft.date ? formatDate(draft.date) : '-'}</dd></div>
          <div><dt>Location</dt><dd>{draft.location || '-'}</dd></div>
          <div><dt>Guests</dt><dd>{draft.guestCount || '-'}</dd></div>
          <div><dt>Budget</dt><dd>{parseNumber(draft.budget) !== null ? formatMoney(parseNumber(draft.budget) ?? 0, currency) : '-'}</dd></div>
          <div><dt>Theme</dt><dd>{theme?.label ?? '-'}</dd></div>
          <div><dt>Venue</dt><dd>{VENUE_STATUS_LABEL[draft.venueStatus || 'not-started']}</dd></div>
          <div><dt>Priorities</dt><dd>{draft.priorities.join(', ') || '-'}</dd></div>
        </dl>
      </section>
    </div>
  )
}

