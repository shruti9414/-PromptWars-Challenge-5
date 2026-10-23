import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { store } from '../state/store'
import { renderApp } from './helpers'

beforeAll(() => {
  window.scrollTo = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
})

const wedding = () => store.getState().events.find((e) => e.id === 'demo-wedding')!

describe('anniversary events', () => {
  it('can be picked in the wizard and gets a starter plan that adds up', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/new')
    await user.click(screen.getByRole('radio', { name: /anniversary/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/event name/i), 'Silver Jubilee')
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: '2027-03-20' } })
    await user.type(screen.getByLabelText(/location/i), 'Pune')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('radio', { name: /golden hour/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /create event/i }))
    await screen.findByRole('heading', { level: 1, name: 'Silver Jubilee' })
    const created = store.getState().events[0]!
    expect(created.type).toBe('anniversary')
    expect(created.tasks.length).toBeGreaterThan(5)
    expect(created.expenses.reduce((a, e) => a + e.estimated, 0)).toBe(created.budget)
  })

  it('shows an Anniversaries filter on My Events', () => {
    renderApp('#/app/events')
    expect(screen.getByRole('button', { name: 'Anniversaries' })).toBeInTheDocument()
  })
})

describe('timeline calendar view', () => {
  it('switches to a month grid, shows tasks on their due dates and opens one for editing', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    const grid = screen.getByRole('table')
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(7)
    const overdue = wedding().tasks.find((t) => t.title === 'Finalise caterer and tasting')!
    const named = new RegExp(`^${overdue.title}, due .*overdue`)
    // The calendar opens on the month of the next upcoming task; step back to the overdue task's month.
    for (let i = 0; i < 24 && !screen.queryByRole('button', { name: named }); i++) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }))
    }
    await user.click(screen.getByRole('button', { name: named }))
    expect(screen.getByRole('dialog', { name: /edit task/i })).toBeInTheDocument()
  })

  it('goes back to the list view and applies filters to the calendar', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: 'Low' }))
    expect(screen.getByText(/no matching tasks/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Any priority' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('task dependencies in the dialog', () => {
  it('saves prerequisites and refuses a loop', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    const base = wedding().tasks.find((t) => t.title === 'Send formal invitations')!
    await user.click(screen.getByRole('button', { name: /add task/i }))
    let dialog = screen.getByRole('dialog', { name: /add task/i })
    await user.type(within(dialog).getByLabelText(/^task/i), 'Mail the invitations')
    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: base.dueDate } })
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(base.title) }))
    await user.click(within(dialog).getByRole('button', { name: /^add task$/i }))
    const added = wedding().tasks.find((t) => t.title === 'Mail the invitations')!
    expect(added.dependsOn).toEqual([base.id])

    // Making the base task depend on the new one would be a loop.
    await user.click(screen.getByRole('button', { name: `Edit ${base.title}` }))
    dialog = screen.getByRole('dialog', { name: /edit task/i })
    await user.click(within(dialog).getByRole('checkbox', { name: /Mail the invitations/ }))
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/loop/i)
    expect(wedding().tasks.find((t) => t.id === base.id)?.dependsOn).toBeUndefined()
  })

  it('refuses a prerequisite that is due after the task', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    const later = wedding().tasks.find((t) => t.title === 'Settle final vendor payments')!
    await user.click(screen.getByRole('button', { name: /add task/i }))
    const dialog = screen.getByRole('dialog', { name: /add task/i })
    await user.type(within(dialog).getByLabelText(/^task/i), 'Early job')
    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: '2026-11-01' } })
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(later.title) }))
    await user.click(within(dialog).getByRole('button', { name: /^add task$/i }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/due after this task/i)
    expect(wedding().tasks.some((t) => t.title === 'Early job')).toBe(false)
  })

  it('clears dependency references when a prerequisite is deleted', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    const [a, b] = wedding().tasks.filter((t) => !t.done)
    store.dispatch({ type: 'item/upsert', eventId: 'demo-wedding', collection: 'tasks', item: { ...b!, dependsOn: [a!.id] } })
    await user.click(screen.getByRole('button', { name: `Delete ${a!.title}` }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }))
    expect(wedding().tasks.find((t) => t.id === a!.id)).toBeUndefined()
    expect(wedding().tasks.find((t) => t.id === b!.id)?.dependsOn).toBeUndefined()
  })
})

describe('vendor favourites', () => {
  it('stars a directory vendor, filters to favourites and keeps the choice in the store', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors/directory')
    const star = () => screen.getByRole('button', { name: /Favourite: Lakeview Palace Gardens/ })
    await user.click(star())
    expect(star()).toHaveAttribute('aria-pressed', 'true')
    expect(wedding().favoriteVendors).toEqual(['dv-venue-1'])
    await user.click(screen.getByRole('checkbox', { name: /Favourites only/ }))
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([expect.stringContaining('Lakeview Palace Gardens')])
    await user.click(star())
    expect(screen.getByText(/no vendors match/i)).toBeInTheDocument()
    expect(wedding().favoriteVendors).toEqual([])
  })
})

describe('changing the event date', () => {
  const editDate = async (user: ReturnType<typeof userEvent.setup>, date: string) => {
    await user.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: date } })
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
  }

  it('previews the new deadlines and moves only open, non-edited tasks by default', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-wedding/edit')
    const before = wedding()
    const newDate = '2027-03-10'
    await editDate(user, newDate)
    const dialog = await screen.findByRole('dialog', { name: /update the timeline/i })
    // Nothing is saved until a button is pressed.
    expect(wedding().date).toBe(before.date)
    await user.click(within(dialog).getByRole('button', { name: /save and move/i }))
    const after = wedding()
    expect(after.date).toBe(newDate)
    for (const t of before.tasks) {
      const now = after.tasks.find((x) => x.id === t.id)!
      if (t.done || t.manual) expect(now.dueDate).toBe(t.dueDate)
      else expect(now.dueDate >= t.dueDate).toBe(true)
    }
    expect(after.tasks.some((t, i) => t.dueDate !== before.tasks[i]!.dueDate)).toBe(true)
  })

  it('can save the event while keeping every task date', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-wedding/edit')
    const before = wedding()
    await editDate(user, '2027-03-10')
    const dialog = await screen.findByRole('dialog', { name: /update the timeline/i })
    await user.click(within(dialog).getByRole('button', { name: /keep task dates/i }))
    expect(wedding().date).toBe('2027-03-10')
    expect(wedding().tasks).toEqual(before.tasks)
  })

  it('cancel leaves the event untouched', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-wedding/edit')
    const before = wedding()
    await editDate(user, '2027-03-10')
    const dialog = await screen.findByRole('dialog', { name: /update the timeline/i })
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }))
    expect(wedding()).toEqual(before)
  })

  it('does not interrupt when only other fields change', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-wedding/edit')
    await user.click(screen.getByRole('button', { name: /next/i }))
    const loc = screen.getByLabelText(/location/i)
    await user.clear(loc)
    await user.type(loc, 'Jodhpur')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(screen.queryByRole('dialog', { name: /update the timeline/i })).not.toBeInTheDocument()
    expect(wedding().location).toBe('Jodhpur')
  })
})
