import { useMemo, useState } from 'react'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, EmptyState, FilterChips, PageHeader, ProgressBar, StatCard } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Fields'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { CATEGORY_BY_ID, PRIORITY_LABEL } from '../../data/constants'
import { describeDays, formatDate } from '../../lib/dates'
import { daysLeft, groupTasks, isOverdue, taskProgress } from '../../lib/tasks'
import { useDocumentTitle, useToday } from '../../hooks'
import { store } from '../../state/store'
import type { EventPlan, Priority, Task } from '../../types'
import { dropDependencyRefs } from '../../lib/dependencies'
import { CalendarView } from './CalendarView'
import { TaskDialog } from './TaskDialog'
import './timeline.css'

type Status = 'all' | 'open' | 'overdue' | 'done'
type PriorityFilter = Priority | 'all'
type View = 'list' | 'calendar'

export function TimelinePage() {
  useDocumentTitle('Timeline')
  return <RequireEvent>{(event) => <Timeline event={event} />}</RequireEvent>
}

function Timeline({ event }: { event: EventPlan }) {
  const today = useToday()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [view, setView] = useState<View>('list')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  const progress = taskProgress(event.tasks)
  const overdueCount = event.tasks.filter((t) => isOverdue(t, today)).length
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return event.tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (priority !== 'all' && t.priority !== priority) return false
      if (status === 'open') return !t.done
      if (status === 'done') return t.done
      if (status === 'overdue') return isOverdue(t, today)
      return true
    })
  }, [event.tasks, query, status, priority, today])
  const groups = useMemo(() => groupTasks(filtered, today), [filtered, today])

  const toggle = (t: Task) => {
    store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'tasks', item: { ...t, done: !t.done } })
  }
  const save = (item: Task) => {
    store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'tasks', item })
    toast(editing === 'new' ? 'Task added' : 'Task updated')
    setEditing(null)
  }

  return (
    <div className="timeline">
      <PageHeader eyebrow={event.name} title="Timeline" actions={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add task</Button>}>
        Everything between now and {formatDate(event.date)}, in the order it needs doing.
      </PageHeader>

      <div className="stat-grid stat-grid--3">
        <StatCard label="Completed" value={`${progress.done} / ${progress.total}`} note="tasks done" tone="ok" />
        <StatCard label="Overdue" value={overdueCount} note={overdueCount ? 'needs attention' : 'all on schedule'} tone={overdueCount ? 'danger' : undefined} />
        <StatCard label="Event in" value={`${Math.max(daysLeft(event.date, today), 0)} days`} note={formatDate(event.date)} />
      </div>
      <ProgressBar value={progress.percent} label="Tasks completed" tone="ok" showValue />

      <div className="toolbar">
        <SearchInput label="Search tasks" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterChips<Status> label="Filter by status" value={status} onChange={setStatus}
          options={[{ id: 'all', label: 'All' }, { id: 'open', label: 'To do' }, { id: 'overdue', label: 'Overdue' }, { id: 'done', label: 'Done' }]} />
        <FilterChips<View> label="Timeline view" value={view} onChange={setView} options={[{ id: 'list', label: 'List' }, { id: 'calendar', label: 'Calendar' }]} />
        <FilterChips<PriorityFilter> label="Filter by priority" value={priority} onChange={setPriority}
          options={[{ id: 'all', label: 'Any priority' }, { id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }, { id: 'low', label: 'Low' }]} />
      </div>

      {event.tasks.length === 0 ? (
        <EmptyState icon="tasks" title="No tasks yet" action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add the first task</Button>}>
          Break the event into dated tasks to see your timeline take shape.
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState icon="search" title="No matching tasks">Adjust the search or filters.</EmptyState>
      ) : view === 'calendar' ? (
        <CalendarView tasks={filtered} today={today} eventDate={event.date} onOpen={setEditing} />
      ) : (
        <ol className="tl">
          {groups.map((g) => (
            <li key={g.id} className={`tl__group tl__group--${g.tone}`}>
              <h2 className="tl__heading">{g.label} <span className="tl__count">{g.tasks.length}</span></h2>
              <ul className="tl__list">
                {g.tasks.map((t) => {
                  const d = daysLeft(t.dueDate, today)
                  return (
                    <li key={t.id} className={`task${t.done ? ' is-done' : ''}`}>
                      <label className="task__check">
                        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
                        <span className="task__box" aria-hidden="true" />
                        <span className="sr-only">Mark "{t.title}" as {t.done ? 'not done' : 'done'}</span>
                      </label>
                      <div className="task__main">
                        <p className="task__title">{t.title}{t.bookingDeadline && <> <Badge tone="blue">Booking deadline</Badge></>}</p>
                        {t.description && <p className="task__desc">{t.description}</p>}
                        <p className="task__meta">
                          <span className={isOverdue(t, today) ? 'text-danger' : undefined}>
                            Due {formatDate(t.dueDate, 'short')}{!t.done && ` · ${describeDays(d)}`}
                          </span>
                          {t.category && <span>{CATEGORY_BY_ID[t.category].label}</span>}
                          {t.dependsOn && t.dependsOn.length > 0 && <span>After: {t.dependsOn.map((d) => event.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(', ')}</span>}
                        </p>
                      </div>
                      <Badge tone={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warn' : 'neutral'}>{PRIORITY_LABEL[t.priority]}</Badge>
                      <div className="task__actions">
                        <IconButton icon="edit" label={`Edit ${t.title}`} onClick={() => setEditing(t)} />
                        <IconButton icon="trash" label={`Delete ${t.title}`} onClick={() => setDeleting(t)} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <TaskDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        task={editing && editing !== 'new' ? editing : undefined}
        allTasks={event.tasks}
        defaultDate={event.date > today ? today : event.date}
        maxDate={event.date}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete "${deleting?.title ?? ''}"?`}
        message="This task will be removed from the timeline."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) store.dispatch({ type: 'event/update', id: event.id, patch: { tasks: dropDependencyRefs(event.tasks.filter((t) => t.id !== deleting.id), deleting.id) } })
          toast('Task deleted')
          setDeleting(null)
        }}
      />
    </div>
  )
}

