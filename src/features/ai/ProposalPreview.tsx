import { useState } from 'react'
import { isStale } from '../../ai/proposal'
import type { BudgetVariant, Proposal } from '../../ai/proposal'
import { Button } from '../../components/ui/Button'
import { Badge, DemoTag } from '../../components/ui/Display'
import { Icon } from '../../components/ui/Icon'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { CATEGORY_BY_ID, PRIORITY_LABEL } from '../../data/constants'
import { formatDate } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { applyReviewedProposal } from './actions'
import { useSettings } from '../../state/store'
import type { EventPlan } from '../../types'
import { PlanSections } from './PlanSections'

interface Props {
  event: EventPlan
  proposal: Proposal
  onDismiss: () => void
  onApplied: () => void
}

export function SourceBadge({ source, model }: { source: 'live' | 'demo'; model?: string }) {
  return source === 'live' ? <Badge tone="ok">Live AI{model ? ` · ${model}` : ''}</Badge> : <DemoTag>Demo planner, not AI</DemoTag>
}

/**
 * Shows exactly what a proposal would change. Nothing is saved until "Apply" is confirmed in the dialog.
 */
export function ProposalPreview({ event, proposal: p, onDismiss, onApplied }: Props) {
  const { currency } = useSettings()
  const money = (n: number) => formatMoney(n, currency)
  const [variant, setVariant] = useState<BudgetVariant>(p.budget?.fitted ? 'fitted' : 'proposed')
  const [confirming, setConfirming] = useState(false)
  const b = p.budget
  const rows = b ? (variant === 'fitted' && b.fitted ? b.fitted : b.proposed) : []
  const analysis = b ? (variant === 'fitted' && b.analysisFitted ? b.analysisFitted : b.analysisProposed) : null

  const apply = () => {
    const ok = applyReviewedProposal(event.id, p, variant)
    setConfirming(false)
    if (!ok) {
      toast('Your event changed since this preview. Nothing was applied; please regenerate.')
      onDismiss()
      return
    }
    toast('Changes applied. You can undo them from Plan history.')
    onApplied()
  }

  return (
    <section className="proposal card" aria-labelledby="proposal-title">
      <div className="card__head">
        <h2 id="proposal-title" className="card__title">Review proposed changes</h2>
        <SourceBadge source={p.source} model={p.model} />
      </div>
      <p className="proposal__summary">{p.summary}</p>
      <p className="muted">Nothing has been changed yet. All prices below are planning estimates, not vendor quotations.</p>

      {p.issues.length > 0 && (
        <div className="notice proposal__issues" role="status">
          <Icon name="alert" size={18} />
          <div>
            <strong>Needs your attention</strong>
            <ul className="plain-list">{p.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        </div>
      )}

      {(p.eventChanges.guestCount || p.eventChanges.budget) && (
        <div className="changes">
          {p.eventChanges.guestCount && <p>Guests: <s>{p.eventChanges.guestCount.from}</s> &rarr; <strong>{p.eventChanges.guestCount.to}</strong></p>}
          {p.eventChanges.budget && <p>Total budget: <s>{money(p.eventChanges.budget.from)}</s> &rarr; <strong>{money(p.eventChanges.budget.to)}</strong></p>}
        </div>
      )}

      {b && analysis && (
        <section aria-label="Budget proposal" className="plan-block">
          <h3 className="plan-block__title">Budget (estimates)</h3>
          {b.fitted && (
            <fieldset className="fieldset variant">
              <legend className="field__label">Allocation</legend>
              <label className="check-inline">
                <input type="radio" name="variant" checked={variant === 'fitted'} onChange={() => setVariant('fitted')} />
                Trimmed to fit your budget ({money(b.analysisFitted?.total ?? 0)})
              </label>
              <label className="check-inline">
                <input type="radio" name="variant" checked={variant === 'proposed'} onChange={() => setVariant('proposed')} />
                As proposed, over budget by {money(b.analysisProposed.overBy)}
              </label>
            </fieldset>
          )}
          <div className="stat-grid stat-grid--3">
            <div className="stat"><p className="stat__label">Estimated total</p><p className="stat__value">{money(analysis.total)}</p><p className="stat__note">of {money(analysis.budget)} budget</p></div>
            <div className="stat"><p className="stat__label">Per guest</p><p className="stat__value">{money(analysis.perGuest)}</p></div>
            <div className={`stat ${analysis.overBudget ? 'stat--danger' : 'stat--ok'}`}>
              <p className="stat__label">{analysis.overBudget ? 'Over budget by' : 'Left unallocated'}</p>
              <p className="stat__value">{money(analysis.overBudget ? analysis.overBy : analysis.difference)}</p>
            </div>
          </div>
          {!b.feasible && <p className="form-alert" role="alert">This plan cannot fit your budget even after trimming. Raise the budget, reduce guests or simplify.</p>}
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Proposed budget lines</caption>
              <thead><tr><th scope="col">Line</th><th scope="col">Category</th><th scope="col" className="num">Estimate</th><th scope="col">Why</th></tr></thead>
              <tbody>
                {b.kept.map((e) => (
                  <tr key={e.id}><th scope="row" className="table__title">{e.title} <Badge tone="blue">Kept</Badge></th><td>{CATEGORY_BY_ID[e.category].label}</td><td className="num">{money(e.actual ?? e.estimated)}</td><td className="muted">Already paid, billed or edited by you</td></tr>
                ))}
                {rows.map((e) => {
                  const why = b.lines.find((l) => e.title.startsWith(l.title))
                  return (
                    <tr key={e.id}>
                      <th scope="row" className="table__title">{e.title}{why && !why.essential && <> <Badge>Optional</Badge></>}</th>
                      <td>{CATEGORY_BY_ID[e.category].label}</td>
                      <td className="num">{money(e.estimated)}</td>
                      <td className="muted">{why?.rationale ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {b.replaced > 0 && <p className="muted">{b.replaced} existing line{b.replaced === 1 ? '' : 's'} will be replaced.</p>}
          {b.savings.length > 0 && (
            <div><h4 className="plan-block__title">Cost-saving alternatives (estimates)</h4>
              <ul className="plain-list">{b.savings.map((s) => <li key={s.idea}>{s.idea}: about {money(s.estimatedSaving)}</li>)}</ul></div>
          )}
          {b.upgrades.length > 0 && (
            <div><h4 className="plan-block__title">Optional upgrades</h4><ul className="plain-list">{b.upgrades.map((u) => <li key={u}>{u}</li>)}</ul></div>
          )}
        </section>
      )}

      {p.timeline && (
        <section aria-label="Timeline proposal" className="plan-block">
          <h3 className="plan-block__title">Timeline ({p.timeline.tasks.length} tasks{p.timeline.compressed ? ', compressed' : ''})</h3>
          <ol className="order-list">
            {p.timeline.tasks.filter((t) => !t.manual && !t.done).map((t) => (
              <li key={t.id}>
                <span className="order-list__date">{formatDate(t.dueDate, 'short')}</span>
                <span><strong>{t.title}</strong> {t.bookingDeadline && <Badge tone="blue">Booking deadline</Badge>} <Badge tone={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warn' : 'neutral'}>{PRIORITY_LABEL[t.priority]}</Badge>
                  {t.description && <span className="muted order-list__desc">{t.description}</span>}
                  {t.dependsOn && t.dependsOn.length > 0 && <span className="muted order-list__desc">After: {t.dependsOn.map((d) => p.timeline!.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(', ')}</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="muted">{p.timeline.kept} existing task{p.timeline.kept === 1 ? '' : 's'} kept (done or edited by you); {p.timeline.replaced} replaced.</p>
        </section>
      )}

      {p.vendors && (
        <section aria-label="Vendor proposal" className="plan-block">
          <h3 className="plan-block__title">Vendor checklist</h3>
          <p className="muted">Requirements and search criteria only. No real businesses or availability are included.</p>
          <ul className="vendor-req">
            {p.vendors.vendors.filter((v) => v.requirement).map((v) => (
              <li key={v.id}>
                <p><strong>{v.name}</strong> <Badge tone={v.priority === 'book-first' ? 'danger' : 'violet'}>{v.priority === 'book-first' ? 'Book first' : `${PRIORITY_LABEL[v.priority === 'low' ? 'low' : v.priority === 'medium' ? 'medium' : 'high']} priority`}</Badge>{v.bookBy && <span className="muted"> &middot; book by {formatDate(v.bookBy, 'short')}</span>}</p>
                <p>{v.requirement}</p>
                <ul className="plain-list muted">{v.criteria?.map((c) => <li key={c}>{c}</li>)}</ul>
              </li>
            ))}
          </ul>
          <p className="muted">{p.vendors.kept} vendor{p.vendors.kept === 1 ? '' : 's'} you are already working with stay as they are.</p>
        </section>
      )}

      <PlanSections plan={p.plan} />

      <div className="proposal__actions">
        <Button variant="primary" icon="check" onClick={() => setConfirming(true)}>Apply changes</Button>
        <Button onClick={onDismiss}>Discard</Button>
      </div>

      <Modal
        open={confirming}
        title="Apply these changes?"
        description="Your current plan will be updated. A snapshot is saved so you can undo this."
        size="sm"
        onClose={() => setConfirming(false)}
        footer={<><Button onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" onClick={apply}>Confirm and apply</Button></>}
      >
        <ul className="plain-list">
          {p.touches.map((t) => <li key={t}>{t}</li>)}
        </ul>
        {isStale(event, p) && <p className="form-alert" role="alert">Your event changed after this preview, so it cannot be applied safely.</p>}
      </Modal>
    </section>
  )
}
