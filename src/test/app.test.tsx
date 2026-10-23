import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { store } from '../state/store'
import { renderApp } from './helpers'

beforeAll(() => {
  window.scrollTo = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
})

const wedding = () => store.getState().events.find((e) => e.id === 'demo-wedding')!

describe('landing page', () => {
  it('shows the product, labels the demo honestly and links into the app', async () => {
    renderApp('#/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/dream event/i)
    expect(screen.getByText(/sample events included/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('link', { name: /explore the demo/i })[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: /Aarav & Meera/ })).toBeInTheDocument()
  })
})

describe('event wizard', () => {
  it('blocks each step until its fields are valid and shows accessible errors', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/new')

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(/choose the kind of event/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /birthday/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByRole('heading', { name: 'The basics' })).toBeInTheDocument()

    // Defaults are prefilled from the event type; blank the name and push an invalid date.
    await user.click(screen.getByRole('button', { name: /next/i }))
    const name = screen.getByLabelText(/event name/i)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(/at least 3 characters/i)
    expect(screen.getByText(/pick the event date/i)).toBeInTheDocument()
    expect(screen.getByText(/where will it happen/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: '2026-10-01' } })
    await user.type(name, 'Kiara birthday')
    await user.type(screen.getByLabelText(/location/i), 'Goa')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/cannot be in the past/i)).toBeInTheDocument()
  })

  it('keeps entered data when going back and creates an event with a starter plan', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/new')
    const before = store.getState().events.length

    await user.click(screen.getByRole('radio', { name: /wedding/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/event name/i), 'Test Wedding')
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: '2027-02-14' } })
    await user.type(screen.getByLabelText(/location/i), 'Jaipur')
    await user.click(screen.getByRole('button', { name: /next/i }))

    // Step 3: budget prefilled from defaults, theme required.
    expect(screen.getByRole('heading', { name: /budget & theme/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/pick a theme/i)).toBeInTheDocument()
    expect(screen.getByText(/suggested split for a wedding/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Test Wedding')
    await user.click(screen.getByRole('button', { name: /next/i }))

    await user.click(screen.getByRole('radio', { name: /golden hour/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Outdoor' }))
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Test Wedding' })).toBeInTheDocument()
    const state = store.getState()
    expect(state.events).toHaveLength(before + 1)
    const created = state.events[0]!
    expect(created).toMatchObject({ name: 'Test Wedding', type: 'wedding', location: 'Jaipur', theme: 'golden-hour', guestCount: 150, budget: 2500000, preferences: ['Outdoor'] })
    expect(created.expenses.reduce((a, e) => a + e.estimated, 0)).toBe(2500000)
    expect(created.tasks.length).toBeGreaterThan(0)
    expect(state.activeEventId).toBe(created.id)
  })

  it('restores an unfinished draft after leaving the page', async () => {
    const user = userEvent.setup()
    const first = renderApp('#/app/events/new')
    await user.click(screen.getByRole('radio', { name: /community/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/event name/i), 'Saved draft')
    first.unmount()
    window.location.hash = '#/app/events/new'
    render(<App />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Saved draft')
  })

  it('edits an existing event', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-birthday/edit')
    // Edit mode starts on step 1 with the saved type selected; move to the basics step.
    expect(screen.getByRole('radio', { name: /birthday/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /next/i }))
    const input = screen.getByLabelText(/event name/i)
    await user.clear(input)
    await user.type(input, 'Kiara 31st')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My Events' })).toBeInTheDocument()
    expect(store.getState().events.find((e) => e.id === 'demo-birthday')?.name).toBe('Kiara 31st')
  })
})

describe('budget', () => {
  it('shows correct totals for the sample wedding', () => {
    renderApp('#/app/budget')
    const committed = screen.getByText('Committed', { selector: '.stat__label' }).parentElement!
    expect(within(committed).getByText('₹24,52,000')).toBeInTheDocument()
    const remaining = screen.getByText('Remaining', { selector: '.stat__label' }).parentElement!
    expect(within(remaining).getByText('₹3,48,000')).toBeInTheDocument()
  })

  it('adds an expense, updates the totals and validates input', async () => {
    const user = userEvent.setup()
    renderApp('#/app/budget')
    await user.click(screen.getByRole('button', { name: /add expense/i }))
    const dialog = screen.getByRole('dialog', { name: /add expense/i })

    await user.click(within(dialog).getByRole('button', { name: /^add expense$/i }))
    expect(within(dialog).getByText(/name this expense/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/enter a planned amount/i)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/^expense/i), 'Extra lighting')
    await user.type(within(dialog).getByLabelText(/planned amount/i), '100000')
    await user.type(within(dialog).getByLabelText(/actual amount/i), 'abc')
    await user.click(within(dialog).getByRole('button', { name: /^add expense$/i }))
    expect(within(dialog).getByText(/valid number/i)).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText(/actual amount/i))
    await user.click(within(dialog).getByRole('button', { name: /^add expense$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(wedding().expenses.some((e) => e.title === 'Extra lighting' && e.estimated === 100000)).toBe(true)
    const committed = screen.getByText('Committed', { selector: '.stat__label' }).parentElement!
    expect(within(committed).getByText('₹25,52,000')).toBeInTheDocument()
  })

  it('warns when spending goes over budget', async () => {
    const user = userEvent.setup()
    renderApp('#/app/budget')
    await user.click(screen.getByRole('button', { name: /adjust total/i }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(/total budget/i)
    await user.clear(input)
    await user.type(input, '2000000')
    await user.click(within(dialog).getByRole('button', { name: /save budget/i }))
    const over = screen.getByText('Over budget by', { selector: '.stat__label' }).parentElement!
    expect(within(over).getByText('₹4,52,000')).toBeInTheDocument()
  })

  it('marks an expense paid, filters, and deletes after confirmation', async () => {
    const user = userEvent.setup()
    renderApp('#/app/budget')
    const paidBefore = wedding().expenses.filter((e) => e.paid).length
    await user.click(screen.getByRole('checkbox', { name: /paid: floral and stage decor/i }))
    expect(wedding().expenses.filter((e) => e.paid)).toHaveLength(paidBefore + 1)

    await user.type(screen.getByRole('searchbox', { name: /search expenses/i }), 'photo')
    expect(screen.getByText('Photo and video team')).toBeInTheDocument()
    expect(screen.queryByText('Return gifts')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: /search expenses/i }))

    await user.click(screen.getByRole('button', { name: /delete return gifts/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    expect(wedding().expenses.some((e) => e.title === 'Return gifts')).toBe(false)
  })
})

describe('timeline', () => {
  it('groups overdue tasks first and toggles completion', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings[0]).toMatch(/^Overdue/)
    const doneBefore = wedding().tasks.filter((t) => t.done).length
    await user.click(screen.getByRole('checkbox', { name: /mark "finalise caterer and tasting" as done/i }))
    expect(wedding().tasks.filter((t) => t.done)).toHaveLength(doneBefore + 1)
    expect(screen.getByRole('checkbox', { name: /mark "finalise caterer and tasting" as not done/i })).toBeChecked()
  })

  it('adds a task with a due date and priority, and rejects an empty title', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    await user.click(screen.getByRole('button', { name: /add task/i }))
    const dialog = screen.getByRole('dialog', { name: /add task/i })
    await user.click(within(dialog).getByRole('button', { name: /^add task$/i }))
    expect(within(dialog).getByText(/describe the task/i)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/^task/i), 'Order welcome signage')
    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: '2026-12-10' } })
    await user.selectOptions(within(dialog).getByLabelText(/priority/i), 'high')
    await user.click(within(dialog).getByRole('button', { name: /^add task$/i }))
    const added = wedding().tasks.find((t) => t.title === 'Order welcome signage')
    expect(added).toMatchObject({ dueDate: '2026-12-10', priority: 'high', done: false })
    expect(screen.getByText('Order welcome signage')).toBeInTheDocument()
  })

  it('filters by status and priority', async () => {
    const user = userEvent.setup()
    renderApp('#/app/timeline')
    await user.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(screen.getByText('Finalise caterer and tasting')).toBeInTheDocument()
    expect(screen.queryByText('Send formal invitations')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(screen.getByRole('button', { name: 'Low' }))
    expect(screen.getByText(/no matching tasks/i)).toBeInTheDocument()
  })
})
