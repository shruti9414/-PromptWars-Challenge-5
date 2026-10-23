import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DonutChart } from '../../components/charts/Charts'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { ButtonLink } from '../../components/ui/Button'
import { Badge, DemoTag, ProgressBar, ProgressRing } from '../../components/ui/Display'
import { Icon } from '../../components/ui/Icon'
import { CATEGORY_BY_ID, EVENT_TYPE_LABEL, THEMES, VENDOR_STATUS_LABEL } from '../../data/constants'
import { describeDays, formatDate } from '../../lib/dates'
import { summarizeBudget, totalsByCategory } from '../../lib/budget'
import { formatMoney } from '../../lib/format'
import { buildInsights } from '../../lib/insights'
import { daysLeft, guestStats, sortTasks, taskProgress, vendorProgress } from '../../lib/tasks'
import { useDocumentTitle, useToday } from '../../hooks'
import { useSettings } from '../../state/store'
import type { EventPlan } from '../../types'
import './dashboard.css'

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  return <RequireEvent>{(event) => <Dashboard event={event} />}</RequireEvent>
}

function Dashboard({ event }: { event: EventPlan }) {
  const today = useToday()
  const { currency } = useSettings()
  const days = daysLeft(event.date, today)
  const budget = useMemo(() => summarizeBudget(event.budget, event.expenses), [event.budget, event.expenses])
  const tasks = taskProgress(event.tasks)
  const vendors = vendorProgress(event.vendors)
  const guests = guestStats(event.guests)
  const insights = useMemo(() => buildInsights(event, today), [event, today])
  const upcoming = useMemo(() => sortTasks(event.tasks.filter((t) => !t.done)).slice(0, 5), [event.tasks])
  const slices = useMemo(
    () => totalsByCategory(event.expenses).map((t) => ({ id: t.category, label: CATEGORY_BY_ID[t.category].label, value: t.committed, color: CATEGORY_BY_ID[t.category].color })),
    [event.expenses],
  )
  const theme = THEMES.find((t) => t.id === event.theme)
  const money = (n: number) => formatMoney(n, currency, true)

  return (
    <div className="dash">
      <section className="hero-card" style={{ backgroundImage: `linear-gradient(100deg, rgb(8 12 40 / 0.92) 25%, rgb(8 12 40 / 0.35)), url(${event.coverImage})` }}>
        <div className="hero-card__top">
          <Badge tone="violet">{EVENT_TYPE_LABEL[event.type]}</Badge>
          {event.isDemo && <DemoTag>Sample event</DemoTag>}
        </div>
        <h1 className="hero-card__title">{event.name}</h1>
        <p className="hero-card__meta">
          <span><Icon name="calendar" size={16} /> {formatDate(event.date)}</span>
          <span><Icon name="pin" size={16} /> {event.location}</span>
          <span><Icon name="users" size={16} /> {event.guestCount} guests planned</span>
          {theme && <span><Icon name="sparkles" size={16} /> {theme.label}</span>}
        </p>
        <div className="hero-card__count" aria-label={days >= 0 ? `${days} days to go` : 'Event date has passed'}>
          <span className="hero-card__days">{Math.max(days, 0)}</span>
          <span className="hero-card__days-label">{days > 0 ? 'days to go' : days === 0 ? 'it’s today!' : 'event has passed'}</span>
        </div>
        <div className="hero-card__actions">
          <ButtonLink to={`/app/events/${event.id}/edit`} variant="light" icon="edit" size="sm">Edit event</ButtonLink>
          <ButtonLink to="/app/events" variant="ghost" size="sm" className="btn--on-dark">All events</ButtonLink>
        </div>
      </section>

      <section className="dash__rings card" aria-label="Planning progress">
        <ProgressRing value={tasks.percent} label="Tasks completed" caption={`${tasks.done}/${tasks.total} tasks`} />
        <ProgressRing value={budget.percentCommitted} label="Budget committed" caption="of budget" />
        <ProgressRing value={vendors.percent} label="Vendors booked" caption={`${vendors.booked}/${vendors.total} booked`} />
        <ProgressRing value={guests.responseRate} label="RSVPs received" caption={`${guests.invited - guests.pending}/${guests.invited} replied`} />
      </section>

      <section className="card dash__budget" aria-labelledby="dash-budget">
        <div className="card__head">
          <h2 id="dash-budget" className="card__title">Budget at a glance</h2>
          <Link to="/app/budget" className="link-arrow">Open budget <Icon name="arrow" size={16} /></Link>
        </div>
        <DonutChart
          slices={slices}
          centerLabel="Committed"
          centerValue={money(budget.committed)}
          format={money}
          ariaLabel={`Budget donut chart. ${money(budget.committed)} committed of ${money(budget.total)}.`}
        />
        <p className={`dash__remain${budget.overBudget ? ' is-over' : ''}`}>
          {budget.overBudget ? `Over budget by ${formatMoney(budget.overBy, currency)}` : `${formatMoney(budget.remaining, currency)} left to allocate`}
        </p>
        <ProgressBar value={budget.percentCommitted} label="Budget committed" tone={budget.overBudget ? 'danger' : budget.percentCommitted > 90 ? 'warn' : 'violet'} />
      </section>

      <section className="card dash__tasks" aria-labelledby="dash-tasks">
        <div className="card__head">
          <h2 id="dash-tasks" className="card__title">Up next</h2>
          <Link to="/app/timeline" className="link-arrow">Full timeline <Icon name="arrow" size={16} /></Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">Every task is done. Enjoy the event!</p>
        ) : (
          <ul className="mini-list">
            {upcoming.map((t) => {
              const d = daysLeft(t.dueDate, today)
              return (
                <li key={t.id} className="mini-list__row">
                  <span className={`dot dot--${t.priority}`} aria-hidden="true" />
                  <span className="mini-list__text">{t.title}</span>
                  <span className={`mini-list__when${d < 0 ? ' is-late' : ''}`}>{d < 0 ? `Overdue ${formatDate(t.dueDate, 'short')}` : `${formatDate(t.dueDate, 'short')} · ${describeDays(d)}`}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card dash__vendors" aria-labelledby="dash-vendors">
        <div className="card__head">
          <h2 id="dash-vendors" className="card__title">Vendors</h2>
          <Link to="/app/vendors" className="link-arrow">Checklist <Icon name="arrow" size={16} /></Link>
        </div>
        {event.vendors.length === 0 ? (
          <p className="muted">No vendors on the checklist yet.</p>
        ) : (
          <ul className="mini-list">
            {event.vendors.slice(0, 6).map((v) => (
              <li key={v.id} className="mini-list__row">
                <span className="mini-list__text">{CATEGORY_BY_ID[v.category].label}: {v.name}</span>
                <Badge tone={v.status === 'booked' ? 'ok' : v.status === 'declined' ? 'danger' : v.status === 'to-research' ? 'neutral' : 'blue'}>{VENDOR_STATUS_LABEL[v.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card dash__insights" aria-labelledby="dash-insights">
        <div className="card__head">
          <h2 id="dash-insights" className="card__title"><Icon name="sparkles" size={18} /> Planning suggestions</h2>
          <DemoTag>Rule-based, not live AI</DemoTag>
        </div>
        <ul className="insights">
          {insights.map((i) => (
            <li key={i.id} className={`insight insight--${i.tone}`}>
              <Link to={i.to} className="insight__link">
                <strong>{i.title}</strong>
                <span>{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
