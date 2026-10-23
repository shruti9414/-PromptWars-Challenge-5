import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Display'
import { Modal } from '../../components/ui/Modal'
import { formatDate } from '../../lib/dates'
import type { ReschedulePlan } from '../../lib/reschedule'

interface Props {
  plan: ReschedulePlan
  oldDate: string
  newDate: string
  onCancel: () => void
  /** `moveIds` are the task ids whose due dates should change; empty keeps every task as it is. */
  onConfirm: (moveIds: Set<string>) => void
}

/**
 * Shown when an event's date changes. Nothing is saved until the user picks one of the buttons.
 * Tasks created or edited by the user start unticked, so they only move with explicit consent.
 */
export function ReschedulePreview({ plan, oldDate, newDate, onCancel, onConfirm }: Props) {
  const auto = plan.shifts.filter((s) => !s.manual)
  const manual = plan.shifts.filter((s) => s.manual)
  const [moveManual, setMoveManual] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setMoveManual((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const moveIds = new Set([...auto.map((s) => s.task.id), ...moveManual])

  return (
    <Modal
      open
      size="md"
      title="Update the timeline for the new date?"
      description={`The event moves from ${formatDate(oldDate)} to ${formatDate(newDate)}. Review which task deadlines would change. Nothing is saved until you choose.`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(new Set())}>Save event, keep task dates</Button>
          <Button variant="primary" onClick={() => onConfirm(moveIds)}>Save and move {moveIds.size} task{moveIds.size === 1 ? '' : 's'}</Button>
        </>
      }
    >
      {plan.compressed && (
        <p className="form-alert" role="status">The new date leaves less time than before, so lead times were shortened proportionally. Review the dates below.</p>
      )}
      {auto.length > 0 && (
        <section aria-label="Tasks that will move">
          <h3 className="plan-block__title">Will move ({auto.length})</h3>
          <ul className="plain-list">
            {auto.map((s) => <li key={s.task.id}><strong>{s.task.title}</strong>: {formatDate(s.from, 'short')} &rarr; {formatDate(s.to, 'short')}</li>)}
          </ul>
        </section>
      )}
      {manual.length > 0 && (
        <section aria-label="Tasks you edited">
          <h3 className="plan-block__title">Tasks you created or edited ({manual.length}) <Badge tone="blue">Kept unless you tick</Badge></h3>
          <ul className="plain-list">
            {manual.map((s) => (
              <li key={s.task.id}>
                <label className="check-inline">
                  <input type="checkbox" checked={moveManual.has(s.task.id)} onChange={() => toggle(s.task.id)} />
                  <span><strong>{s.task.title}</strong>: {formatDate(s.from, 'short')} &rarr; {formatDate(s.to, 'short')}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted">Completed tasks never move.</p>
    </Modal>
  )
}
