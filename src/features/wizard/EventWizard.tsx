import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/Display'
import { toast } from '../../components/ui/Toast'
import { EVENT_TYPES } from '../../data/constants'
import { todayISO } from '../../lib/dates'
import {
  EMPTY_DRAFT,
  WIZARD_STEPS,
  draftToInput,
  hasErrors,
  inputToDraft,
  stepOfField,
  validateDraft,
  validateStep,
} from '../../lib/validation'
import type { FieldErrors, WizardStep } from '../../lib/validation'
import { useDocumentTitle } from '../../hooks'
import { createEvent, updateEvent } from '../../state/actions'
import { clearDraft, loadDraft, saveDraft } from '../../state/persistence'
import { useStore } from '../../state/store'
import type { EventDraft, EventPlan } from '../../types'
import { BudgetStep, DetailsStep, PreferencesStep, TypeStep } from './steps'
import './wizard.css'

const STEP_LABEL: Record<WizardStep, string> = {
  type: 'Event type',
  details: 'The basics',
  budget: 'Budget & theme',
  preferences: 'Preferences',
}

function eventToDraft(e: EventPlan): EventDraft {
  return inputToDraft({
    type: e.type, name: e.name, date: e.date, location: e.location, guestCount: e.guestCount,
    budget: e.budget, theme: e.theme, preferences: e.preferences, notes: e.notes,
    venueStatus: e.venueStatus ?? 'not-started', priorities: e.priorities ?? [],
  })
}

export function EventWizardPage() {
  const { id } = useParams()
  const existing = useStore((s) => (id ? s.events.find((e) => e.id === id) : undefined))
  if (id && !existing) return <Navigate to="/app/events" replace />
  return <EventWizard key={id ?? 'new'} existing={existing} />
}

function EventWizard({ existing }: { existing: EventPlan | undefined }) {
  const editing = Boolean(existing)
  useDocumentTitle(editing ? 'Edit event' : 'Plan an event')
  const navigate = useNavigate()
  const today = todayISO()
  // Create mode restores any unfinished draft, so leaving and coming back never loses typing.
  const [draft, setDraft] = useState<EventDraft>(() => (existing ? eventToDraft(existing) : loadDraft()))
  const [stepIndex, setStepIndex] = useState(0)
  const [errors, setErrors] = useState<FieldErrors<EventDraft>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const step = WIZARD_STEPS[stepIndex]!
  const allowPast = editing && draft.date === existing?.date

  useEffect(() => {
    if (!editing) saveDraft(draft)
  }, [draft, editing])

  // Move focus to the step heading when the step changes (not on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [stepIndex])

  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const pickType = (type: EventDraft['type']) => {
    const meta = EVENT_TYPES.find((t) => t.id === type)
    setDraft((d) => ({
      ...d,
      type,
      guestCount: d.guestCount || String(meta?.defaultGuests ?? ''),
      budget: d.budget || String(meta?.defaultBudget ?? ''),
    }))
    setErrors((e) => ({ ...e, type: undefined }))
  }

  const next = () => {
    const found = validateStep(step, draft, today, allowPast)
    setErrors(found)
    if (hasErrors(found)) return
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  }

  const submit = () => {
    const found = validateDraft(draft, today, allowPast)
    if (hasErrors(found)) {
      setErrors(found)
      const firstBad = WIZARD_STEPS.findIndex((s) => Object.keys(found).some((f) => stepOfField(f as keyof EventDraft) === s))
      setStepIndex(Math.max(0, firstBad))
      return
    }
    const input = draftToInput(draft)
    if (existing) {
      updateEvent(existing.id, input)
      toast('Event updated')
      navigate('/app/events')
    } else {
      createEvent(input, draft.useSuggestedPlan)
      clearDraft()
      toast(draft.useSuggestedPlan ? 'Event created with a starter plan' : 'Event created')
      navigate('/app/dashboard')
    }
  }

  const isLast = stepIndex === WIZARD_STEPS.length - 1

  return (
    <div className="wizard">
      <PageHeader eyebrow={editing ? 'Edit event' : 'New event'} title={editing ? `Edit ${existing?.name}` : 'Plan your event'}>
        Four quick steps. Your answers are saved as you go{editing ? '.' : ', so you can leave and pick up later.'}
      </PageHeader>

      <ol className="steps" aria-label="Progress">
        {WIZARD_STEPS.map((s, i) => (
          <li key={s} className={`steps__item${i === stepIndex ? ' is-current' : ''}${i < stepIndex ? ' is-done' : ''}`} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="steps__num">{i < stepIndex ? 'âœ“' : i + 1}</span>
            <span className="steps__label">{STEP_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">Step {stepIndex + 1} of {WIZARD_STEPS.length}: {STEP_LABEL[step]}</p>

      <form
        className="wizard__card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (isLast) submit()
          else next()
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} className="wizard__heading">{STEP_LABEL[step]}</h2>
        {hasErrors(errors) && (
          <p className="form-alert" role="alert">Please fix the highlighted fields to continue.</p>
        )}
        {step === 'type' && <TypeStep draft={draft} errors={errors} onPick={pickType} />}
        {step === 'details' && <DetailsStep draft={draft} errors={errors} today={today} allowPast={allowPast} onChange={update} />}
        {step === 'budget' && <BudgetStep draft={draft} errors={errors} onChange={update} />}
        {step === 'preferences' && <PreferencesStep draft={draft} errors={errors} editing={editing} onChange={update} />}

        <div className="wizard__nav">
          <Button icon="arrowLeft" disabled={stepIndex === 0} onClick={() => { setErrors({}); setStepIndex((i) => Math.max(0, i - 1)) }}>
            Back
          </Button>
          <div className="wizard__nav-right">
            {!editing && (
              <Button variant="ghost" onClick={() => { clearDraft(); setDraft({ ...EMPTY_DRAFT }); setErrors({}); setStepIndex(0); toast('Draft cleared') }}>
                Clear draft
              </Button>
            )}
            {isLast ? (
              <Button type="submit" variant="primary" icon="check">{editing ? 'Save changes' : 'Create event'}</Button>
            ) : (
              <Button type="submit" variant="primary" iconAfter="arrow">Next</Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

