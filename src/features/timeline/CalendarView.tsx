import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { formatDate } from '../../lib/dates'
import { monthMatrix, shiftMonth, tasksByDate } from '../../lib/calendar'
import { isOverdue, sortTasks } from '../../lib/tasks'
import type { Task } from '../../types'

const WEEKDAYS: [string, string][] = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']]

interface Props {
  tasks: Task[]
  today: string
  eventDate: string
  onOpen: (task: Task) => void
}

/** Month grid of the (already filtered) tasks. Every task is a button that opens the edit dialog. */
export function CalendarView({ tasks, today, eventDate, onOpen }: Props) {
  const [month, setMonth] = useState(() => {
    const upcoming = sortTasks(tasks).find((t) => !t.done && t.dueDate >= today)
    return (upcoming?.dueDate ?? today).slice(0, 7)
  })
  const [year, m] = month.split('-').map(Number) as [number, number]
  const weeks = monthMatrix(year, m)
  const byDate = tasksByDate(tasks)
  const inMonth = tasks.filter((t) => t.dueDate.startsWith(month)).length

  return (
    <section aria-labelledby="cal-title">
      <div className="cal__bar">
        <h2 id="cal-title" className="cal__title" aria-live="polite">{formatDate(`${month}-01`, 'month')}</h2>
        <div className="cal__nav">
          <Button size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>Previous month</Button>
          <Button size="sm" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
          <Button size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>Next month</Button>
        </div>
      </div>
      <p className="muted">{inMonth} task{inMonth === 1 ? '' : 's'} due this month. Select a task to edit it.</p>
      <div className="cal__wrap">
        <table className="cal">
          <caption className="sr-only">Tasks by due date for {formatDate(`${month}-01`, 'month')}</caption>
          <thead>
            <tr>{WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((date, j) => {
                  if (!date) return <td key={j} className="is-empty" />
                  const list = byDate.get(date) ?? []
                  const cls = [date === today ? 'is-today' : '', date === eventDate ? 'is-event' : ''].filter(Boolean).join(' ')
                  return (
                    <td key={j} className={cls}>
                      <span className="cal__day">{Number(date.slice(8))}{date === today && <span className="sr-only"> (today)</span>}</span>
                      {date === eventDate && <span className="cal__flag">Event day</span>}
                      {list.length > 0 && (
                        <ul className="cal__tasks">
                          {list.map((t) => (
                            <li key={t.id}>
                              <button type="button" className={`cal__task${t.done ? ' is-done' : isOverdue(t, today) ? ' is-overdue' : ''}`} title={t.title}
                                aria-label={`${t.title}, due ${formatDate(date)}${t.done ? ', done' : isOverdue(t, today) ? ', overdue' : ''}. Edit`} onClick={() => onOpen(t)}>
                                {t.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
