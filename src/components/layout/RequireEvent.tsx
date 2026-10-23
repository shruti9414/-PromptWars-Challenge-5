import type { ReactNode } from 'react'
import { store, useActiveEvent } from '../../state/store'
import type { EventPlan } from '../../types'
import { Button, ButtonLink } from '../ui/Button'
import { EmptyState } from '../ui/Display'

/** Renders children with the active event, or a friendly empty state when there is none. */
export function RequireEvent({ children }: { children: (event: EventPlan) => ReactNode }) {
  const event = useActiveEvent()
  if (!event) {
    return (
      <EmptyState
        icon="calendar"
        title="No event selected"
        action={
          <div className="empty__actions">
            <ButtonLink to="/app/events/new" variant="primary" icon="plus">Plan an event</ButtonLink>
            <Button onClick={() => store.resetToDemo()}>Load sample events</Button>
          </div>
        }
      >
        Create an event to unlock budgets, timelines, vendors and guests, or load the sample events to explore.
      </EmptyState>
    )
  }
  return <>{children(event)}</>
}
