import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Badge, DemoTag, EmptyState, FilterChips, PageHeader, ProgressBar } from '../../components/ui/Display'
import { SearchInput, SelectField } from '../../components/ui/Fields'
import { Icon } from '../../components/ui/Icon'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { EVENT_TYPE_LABEL } from '../../data/constants'
import { describeDays, formatDate } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { daysLeft, taskProgress } from '../../lib/tasks'
import { useDocumentTitle, useToday } from '../../hooks'
import { store, useSettings, useStore } from '../../state/store'
import type { EventPlan, EventType } from '../../types'
import './events.css'

type TypeFilter = EventType | 'all'
type Sort = 'date' | 'name'

export function MyEventsPage() {
  useDocumentTitle('My Events')
  const events = useStore((s) => s.events)
  const activeId = useStore((s) => s.activeEventId)
  const { currency } = useSettings()
  const today = useToday()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [sort, setSort] = useState<Sort>('date')
  const [pendingDelete, setPendingDelete] = useState<EventPlan | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events
      .filter((e) => (type === 'all' || e.type === type) && (!q || `${e.name} ${e.location}`.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'date' ? a.date.localeCompare(b.date) : a.name.localeCompare(b.name)))
  }, [events, query, type, sort])

  const open = (id: string) => {
    store.dispatch({ type: 'event/setActive', id })
    navigate('/app/dashboard')
  }

  return (
    <div>
      <PageHeader eyebrow="Your events" title="My Events" actions={<ButtonLink to="/app/events/new" variant="primary" icon="plus">Plan an event</ButtonLink>}>
        Every celebration you are planning, in one place.
      </PageHeader>

      <div className="toolbar">
        <SearchInput label="Search events" placeholder="Search by name or location" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterChips<TypeFilter>
          label="Filter by event type"
          value={type}
          onChange={setType}
          options={[{ id: 'all', label: 'All' }, { id: 'wedding', label: 'Weddings' }, { id: 'birthday', label: 'Birthdays' }, { id: 'community', label: 'Community' }]}
        />
        <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="toolbar__sort">
          <option value="date">Event date</option>
          <option value="name">Name</option>
        </SelectField>
      </div>

      {events.length === 0 ? (
        <EmptyState icon="calendar" title="No events yet" action={
          <div className="empty__actions">
            <ButtonLink to="/app/events/new" variant="primary" icon="plus">Plan your first event</ButtonLink>
            <Button onClick={() => store.resetToDemo()}>Load sample events</Button>
          </div>}>
          Start a wedding, birthday or community event, or load the sample events to explore.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title="No matching events">Try a different search or filter.</EmptyState>
      ) : (
        <ul className="event-grid" aria-label="Events">
          {shown.map((e) => {
            const days = daysLeft(e.date, today)
            const tasks = taskProgress(e.tasks)
            return (
              <li key={e.id} className={`event-card${e.id === activeId ? ' is-active' : ''}`}>
                <div className="event-card__img" style={{ backgroundImage: `url(${e.coverImage})` }}>
                  <Badge tone="violet">{EVENT_TYPE_LABEL[e.type]}</Badge>
                  {e.isDemo && <DemoTag>Sample</DemoTag>}
                </div>
                <div className="event-card__body">
                  <h2 className="event-card__title">{e.name}</h2>
                  <p className="event-card__meta"><Icon name="calendar" size={15} /> {formatDate(e.date)} <span className="muted">({days >= 0 ? describeDays(days) : 'past'})</span></p>
                  <p className="event-card__meta"><Icon name="pin" size={15} /> {e.location}</p>
                  <p className="event-card__meta"><Icon name="users" size={15} /> {e.guestCount} guests &middot; {formatMoney(e.budget, currency, true)} budget</p>
                  <ProgressBar value={tasks.percent} label={`${e.name} tasks completed`} showValue />
                  <p className="muted event-card__small">{tasks.done} of {tasks.total} tasks done</p>
                </div>
                <div className="event-card__actions">
                  <Button variant="primary" size="sm" onClick={() => open(e.id)}>Open{' '}<span className="sr-only">{e.name}</span></Button>
                  <ButtonLink to={`/app/events/${e.id}/edit`} size="sm" icon="edit">Edit{' '}<span className="sr-only">{e.name}</span></ButtonLink>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => setPendingDelete(e)}>Delete{' '}<span className="sr-only">{e.name}</span></Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        message="The event with its budget, tasks, vendors and guests will be removed from this browser."
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) store.dispatch({ type: 'event/remove', id: pendingDelete.id })
          toast('Event deleted')
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
