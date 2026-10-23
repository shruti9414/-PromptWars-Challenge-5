import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiError, requestPlan } from '../../ai/client'
import { buildAiContext, buildSnapshot } from '../../ai/context'
import type { Flexibility } from '../../ai/context'
import { demoSection } from '../../ai/demo'
import { buildProposal, proposalIsEmpty } from '../../ai/proposal'
import type { Proposal } from '../../ai/proposal'
import { AiContextSchema, PatchSchema } from '../../ai/schema'
import type { SectionKey, Source } from '../../ai/schema'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button } from '../../components/ui/Button'
import { DemoTag, PageHeader } from '../../components/ui/Display'
import { Icon } from '../../components/ui/Icon'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { formatDate } from '../../lib/dates'
import { useDocumentTitle, useToday } from '../../hooks'
import { restoreEventRevision } from './actions'
import { useSettings } from '../../state/store'
import type { EventPlan } from '../../types'
import { AssistantPanel } from './AssistantPanel'
import { PlanSections } from './PlanSections'
import { ProposalPreview, SourceBadge } from './ProposalPreview'
import { useAiStatus } from './useAiStatus'
import './ai.css'

const FLEX_OPTIONS: { id: Flexibility; label: string; hint: string }[] = [
  { id: 'strict', label: 'Strict', hint: 'Do not exceed the budget; larger reserve' },
  { id: 'moderate', label: 'Moderate', hint: 'Stay close, small overruns for priorities' },
  { id: 'flexible', label: 'Flexible', hint: 'Budget is a target; optional upgrades allowed' },
]

const ACTIONS: { id: SectionKey | 'full'; label: string; summary: string }[] = [
  { id: 'theme', label: 'Regenerate theme', summary: 'New concept and theme with matching ideas' },
  { id: 'budget', label: 'Revise budget', summary: 'Revised budget allocation' },
  { id: 'timeline', label: 'Update timeline', summary: 'Updated preparation timeline' },
  { id: 'vendors', label: 'Refresh vendor checklist', summary: 'Refreshed vendor requirements' },
  { id: 'ideas', label: 'Alternative ideas', summary: 'Alternative ideas for decor, activities, entertainment and food' },
]

export function AiPlannerPage() {
  useDocumentTitle('AI Planner')
  return <RequireEvent>{(event) => <Planner event={event} />}</RequireEvent>
}

function Planner({ event }: { event: EventPlan }) {
  const { currency } = useSettings()
  const today = useToday()
  const status = useAiStatus()
  const mode = status?.mode ?? 'demo'
  const [flexibility, setFlexibility] = useState<Flexibility>('moderate')
  const [instructions, setInstructions] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ err: AiError; retry: () => void } | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const context = useMemo(() => buildAiContext(event, currency, flexibility, instructions), [event, currency, flexibility, instructions])

  const show = (p: Proposal) => {
    setProposal(p)
    // Let the preview render, then bring it into view for keyboard and screen-reader users.
    window.setTimeout(() => {
      previewRef.current?.scrollIntoView?.({ block: 'start' })
      previewRef.current?.focus()
    }, 0)
  }

  const run = async (section: SectionKey | 'full', summary: string) => {
    if (busy) return
    setError(null)
    const valid = AiContextSchema.safeParse(context)
    if (!valid.success) {
      const fields = [...new Set(valid.error.issues.map((i) => String(i.path[0])))].join(', ')
      setError({ err: new AiError('invalid_request', `Some event details are missing or invalid (${fields}). Edit the event, then try again.`), retry: () => void run(section, summary) })
      return
    }
    setBusy(summary)
    try {
      let source: Source
      let model: string | undefined
      let patch
      if (mode === 'unreachable') {
        source = 'demo'
        patch = PatchSchema.parse(demoSection(section, context, today))
      } else {
        const res = await requestPlan({ context, section, current: buildSnapshot(event) })
        source = res.source
        model = res.model
        patch = res.patch
      }
      const p = buildProposal({ event, patch, summary, source, model, flexibility, today })
      if (proposalIsEmpty(p)) throw new AiError('invalid_output', 'The plan came back empty. Please try again.')
      show(p)
    } catch (e) {
      setError({ err: e instanceof AiError ? e : new AiError('server', 'Something went wrong. Please try again.'), retry: () => void run(section, summary) })
    } finally {
      setBusy(null)
    }
  }

  const plan = event.aiPlan
  const revisions = event.revisions ?? []

  return (
    <div className="ai">
      <PageHeader eyebrow={event.name} title="AI Event Architect">
        Generate a plan that fits this event, review exactly what would change, then apply it.
      </PageHeader>

      <div className={`mode mode--${mode}`} role="status">
        <Icon name={mode === 'live' ? 'shield' : 'info'} size={20} />
        <p>
          {status === null && 'Checking the planning service…'}
          {mode === 'live' && status && <><strong>Live AI is on</strong> ({status.model}). Plans come from an AI model; every number is re-checked by the app.</>}
          {mode === 'demo' && status && <><strong>Demo mode.</strong> No API key is configured on the server, so plans come from built-in rules, not an AI model. They are still tailored to your event.</>}
          {mode === 'unreachable' && <><strong>Offline demo.</strong> The planning service could not be reached, so the demo planner runs in your browser. It is rule-based, not AI.</>}
        </p>
      </div>

      <div className="ai__grid">
        <div className="ai__main">
          <section className="card" aria-labelledby="ai-controls">
            <h2 id="ai-controls" className="card__title">Plan for this event</h2>
            <fieldset className="fieldset">
              <legend className="field__label">How strict is your budget?</legend>
              <div className="flex-options">
                {FLEX_OPTIONS.map((o) => (
                  <label key={o.id} className={`option${flexibility === o.id ? ' is-selected' : ''}`}>
                    <input type="radio" name="flexibility" className="sr-only-input" checked={flexibility === o.id} onChange={() => setFlexibility(o.id)} />
                    <span className="option__title">{o.label}</span>
                    <span className="option__hint">{o.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="ai-instructions" className="field__label">Anything specific? <span className="field__hint-inline">(optional)</span></label>
              <textarea id="ai-instructions" className="input input--area" rows={2} maxLength={400} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Grandparents will attend, so seating and step-free access matter." aria-describedby="ai-instructions-hint" />
              <p id="ai-instructions-hint" className="field__hint">{instructions.length}/400. Sent to the AI as part of the request, so leave out private details.</p>
            </div>

            <details className="sent">
              <summary>What is sent to the AI</summary>
              <p className="muted">Only these details leave your browser. The event name, notes, guest names and vendor contact details are never sent.</p>
              <pre className="sent__json" tabIndex={0} aria-label="Data sent to the AI">{JSON.stringify(context, null, 2)}</pre>
            </details>

            <div className="ai__actions">
              <Button variant="primary" size="lg" icon="sparkles" disabled={busy !== null} onClick={() => void run('full', 'Full event plan')}>
                {busy === 'Full event plan' ? 'Generating…' : plan ? 'Generate a new full plan' : 'Generate full plan'}
              </Button>
            </div>
            <div className="ai__sections" role="group" aria-label="Regenerate one section">
              <p className="field__label">Or refresh one section only:</p>
              <div className="chips chips--wrap">
                {ACTIONS.map((a) => (
                  <Button key={a.id} size="sm" disabled={busy !== null} onClick={() => void run(a.id, a.summary)}>{busy === a.summary ? 'Working…' : a.label}</Button>
                ))}
              </div>
              <p className="muted">Paid, billed, completed and hand-edited items are always kept.</p>
            </div>

            {busy && <p className="muted" role="status">Building your plan. This can take up to a minute&hellip;</p>}
            {error && (
              <div className="form-alert" role="alert">
                <p>{error.err.message}</p>
                {error.err.kind === 'invalid_request' && <Link to={`/app/events/${event.id}/edit`} className="link">Edit event details</Link>}
                {error.err.retryable && <Button size="sm" onClick={error.retry}>Try again{error.err.retryAfter ? ` (wait about ${error.err.retryAfter}s)` : ''}</Button>}
                <p className="muted">Your event information has not been changed.</p>
              </div>
            )}
          </section>

          <div ref={previewRef} tabIndex={-1} className="ai__preview">
            {proposal && (
              <ProposalPreview key={proposal.id} event={event} proposal={proposal} onDismiss={() => setProposal(null)} onApplied={() => setProposal(null)} />
            )}
          </div>

          {plan && (
            <section className="card" aria-labelledby="saved-plan">
              <div className="card__head">
                <h2 id="saved-plan" className="card__title">Current AI plan</h2>
                <SourceBadge source={plan.source} model={plan.model} />
              </div>
              <p className="muted">Last updated {formatDate(plan.generatedAt.slice(0, 10))}. Prices are estimates, not vendor quotations.</p>
              {plan.issues && plan.issues.length > 0 && (
                <details className="sent"><summary>{plan.issues.length} adjustment{plan.issues.length === 1 ? '' : 's'} made by the app</summary>
                  <ul className="plain-list">{plan.issues.map((i) => <li key={i}>{i}</li>)}</ul></details>
              )}
              {plan.savings && plan.savings.length > 0 && (
                <div className="plan-block"><h3 className="plan-block__title">Cost-saving alternatives</h3>
                  <ul className="plain-list">{plan.savings.map((s) => <li key={s.idea}>{s.idea}</li>)}</ul></div>
              )}
              <PlanSections plan={plan} />
            </section>
          )}

          {revisions.length > 0 && (
            <section className="card" aria-labelledby="history">
              <h2 id="history" className="card__title">Plan history</h2>
              <p className="muted">Each applied change keeps a snapshot of what it replaced.</p>
              <ul className="history">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <span><strong>{r.label}</strong><br /><span className="muted">{new Date(r.createdAt).toLocaleString()} &middot; {r.source === 'live' ? 'live AI' : 'demo planner'}</span></span>
                    <Button size="sm" onClick={() => setRestoring(r.id)}>Restore previous version<span className="sr-only">: {r.label}</span></Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="ai__side">
          <AssistantPanel event={event} mode={mode} flexibility={flexibility} today={today} onPropose={show} />
          <p className="muted ai__foot">{mode === 'live' ? '' : <DemoTag>Simulated</DemoTag>} Suggestions never overwrite your plan until you confirm them.</p>
        </div>
      </div>

      <ConfirmDialog
        open={restoring !== null}
        title="Restore the previous version?"
        message="Budget, tasks, vendors and guest count return to how they were before that change. Newer changes are removed from the history."
        confirmLabel="Restore"
        onCancel={() => setRestoring(null)}
        onConfirm={() => {
          if (restoring) restoreEventRevision(event.id, restoring)
          toast('Previous version restored')
          setRestoring(null)
        }}
      />
    </div>
  )
}
