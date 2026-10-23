import type { StoredAiPlan } from '../../ai/schema'
import { Badge } from '../../components/ui/Display'

type Sections = Partial<Pick<StoredAiPlan, 'overview' | 'recommendations' | 'risks' | 'assumptions' | 'followUpQuestions'>>

const REC_LABEL = { decor: 'Decor', activities: 'Activities', entertainment: 'Entertainment', food: 'Food' } as const
const LIKELIHOOD_TONE = { low: 'neutral', medium: 'warn', high: 'danger' } as const

/** Read-only rendering of the narrative parts of a plan, shared by the proposal preview and the saved plan. */
export function PlanSections({ plan }: { plan: Sections }) {
  return (
    <div className="plan-sections">
      {plan.overview && (
        <section aria-label="Concept and theme" className="plan-block">
          <h4 className="plan-block__title">Concept: {plan.overview.themeName}</h4>
          <p className="plan-block__lead">{plan.overview.tagline}</p>
          <p>{plan.overview.concept}</p>
          <p className="plan-tags">{plan.overview.mood.map((m) => <span key={m} className="tag">{m}</span>)}</p>
        </section>
      )}
      {plan.recommendations && (
        <section aria-label="Ideas" className="plan-block">
          <h4 className="plan-block__title">Ideas</h4>
          <div className="rec-grid">
            {(Object.keys(REC_LABEL) as (keyof typeof REC_LABEL)[]).map((k) => (
              <div key={k}>
                <h5 className="rec-grid__h">{REC_LABEL[k]}</h5>
                <ul className="plain-list">{plan.recommendations![k].map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {plan.risks && plan.risks.length > 0 && (
        <section aria-label="Risks and backup plans" className="plan-block">
          <h4 className="plan-block__title">Risks and backup plans</h4>
          <ul className="risk-list">
            {plan.risks.map((r) => (
              <li key={r.risk} className="risk">
                <p className="risk__head"><strong>{r.risk}</strong> <Badge tone={LIKELIHOOD_TONE[r.likelihood]}>{r.likelihood} likelihood</Badge></p>
                <p><span className="muted">Prevent:</span> {r.mitigation}</p>
                <p><span className="muted">Backup:</span> {r.backupPlan}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {((plan.assumptions?.length ?? 0) > 0 || (plan.followUpQuestions?.length ?? 0) > 0) && (
        <section aria-label="Assumptions and open questions" className="plan-block plan-block--split">
          {plan.assumptions && plan.assumptions.length > 0 && (
            <div>
              <h4 className="plan-block__title">Assumptions</h4>
              <ul className="plain-list">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          {plan.followUpQuestions && plan.followUpQuestions.length > 0 && (
            <div>
              <h4 className="plan-block__title">Missing information</h4>
              <ul className="plain-list">{plan.followUpQuestions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
