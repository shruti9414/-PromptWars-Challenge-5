import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Modal } from '../components/ui/Modal'
import { store } from '../state/store'
import { renderApp } from './helpers'
import { render } from '@testing-library/react'

beforeAll(() => {
  window.scrollTo = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
})

const wedding = () => store.getState().events.find((e) => e.id === 'demo-wedding')!

describe('vendor checklist', () => {
  it('shows booking progress and updates status from the dropdown', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors')
    expect(screen.getByText('4 of 8')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/booking status for saffron & salt caterers/i), 'booked')
    expect(screen.getByText('5 of 8')).toBeInTheDocument()
    expect(wedding().vendors.find((v) => v.name.startsWith('Saffron'))?.status).toBe('booked')
  })

  it('filters by status and searches', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors')
    await user.click(screen.getByRole('button', { name: 'Needed' }))
    expect(screen.getByText('Midnight Raga Collective (Demo)')).toBeInTheDocument()
    expect(screen.queryByText('Bloom Atelier (Demo)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByRole('searchbox', { name: /search vendors/i }), 'photo')
    expect(screen.getByText('Frame & Fable Studio (Demo)')).toBeInTheDocument()
    expect(screen.queryByText('Bloom Atelier (Demo)')).not.toBeInTheDocument()
  })

  it('adds and removes a vendor, validating the quote', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))
    const dialog = screen.getByRole('dialog', { name: /add vendor/i })
    await user.click(within(dialog).getByRole('button', { name: /^add vendor$/i }))
    expect(within(dialog).getByText(/add a vendor name/i)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/vendor name/i), 'Sound Crew')
    await user.type(within(dialog).getByLabelText(/quote/i), '-5')
    await user.click(within(dialog).getByRole('button', { name: /^add vendor$/i }))
    expect(within(dialog).getByText(/cannot be negative/i)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/quote/i))
    await user.type(within(dialog).getByLabelText(/quote/i), '45000')
    await user.click(within(dialog).getByRole('button', { name: /^add vendor$/i }))
    expect(wedding().vendors.find((v) => v.name === 'Sound Crew')?.quote).toBe(45000)

    await user.click(screen.getByRole('button', { name: /remove sound crew/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^remove$/i }))
    expect(wedding().vendors.some((v) => v.name === 'Sound Crew')).toBe(false)
  })
})

describe('vendor directory', () => {
  it('labels vendors as demo and adds one to the checklist once', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors/directory')
    expect(screen.getByText(/these vendors are fictional examples/i)).toBeInTheDocument()
    expect(screen.getByText('Lakeview Palace Gardens (Demo)').closest('li')).toHaveTextContent('On your checklist')

    await user.click(screen.getByRole('button', { name: /add to checklist: the glasshouse loft/i }))
    expect(wedding().vendors.some((v) => v.directoryId === 'dv-venue-2')).toBe(true)
    expect(screen.getByText('The Glasshouse Loft (Demo)').closest('li')).toHaveTextContent('On your checklist')
  })

  it('filters by category and by event type', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors/directory')
    expect(screen.queryByText('Crumb & Candle Bakehouse (Demo)')).not.toBeInTheDocument() // birthday-only
    await user.click(screen.getByRole('checkbox', { name: /only vendors for weddings/i }))
    expect(screen.getByText('Crumb & Candle Bakehouse (Demo)')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/^category/i), 'music')
    expect(screen.getByText('DJ Orbit (Demo)')).toBeInTheDocument()
    expect(screen.queryByText('Crumb & Candle Bakehouse (Demo)')).not.toBeInTheDocument()
  })
})

describe('ideas gallery', () => {
  it('filters by event type, category and cost, and shows an empty state', async () => {
    const user = userEvent.setup()
    renderApp('#/app/ideas')
    expect(screen.getByText('Balloon ceiling')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weddings' }))
    expect(screen.queryByText('Balloon ceiling')).not.toBeInTheDocument()
    expect(screen.getByText('One long feasting table')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.queryByText('Wildflower centrepieces')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Splurge' }))
    expect(screen.getByText('Plated tasting menu')).toBeInTheDocument()
    expect(screen.queryByText('One long feasting table')).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: /search ideas/i }), 'zzzz')
    expect(screen.getByText(/no ideas match/i)).toBeInTheDocument()
  })

  it('saves and un-saves an idea on the active event', async () => {
    const user = userEvent.setup()
    renderApp('#/app/ideas')
    const save = screen.getByRole('button', { name: /^save balloon ceiling/i })
    expect(save).toHaveAttribute('aria-pressed', 'false')
    await user.click(save)
    expect(wedding().savedIdeas).toContain('idea-balloon-ceiling')
    expect(screen.getByRole('button', { name: /unsave balloon ceiling/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('checkbox', { name: /saved ideas only/i }))
    expect(screen.getByText('Balloon ceiling')).toBeInTheDocument()
    expect(screen.queryByText('Wildflower centrepieces')).not.toBeInTheDocument()
  })
})

describe('guest management', () => {
  it('shows live RSVP statistics and filters by RSVP', async () => {
    const user = userEvent.setup()
    renderApp('#/app/guests')
    const attending = screen.getByText('Attending', { selector: '.stat__label' }).parentElement!
    expect(within(attending).getByText('10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Declined' }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Dev Malhotra')).toBeInTheDocument()
  })

  it('changes an RSVP and recalculates the headcount', async () => {
    const user = userEvent.setup()
    renderApp('#/app/guests')
    const before = screen.getByText(/confirmed of/i).textContent
    await user.selectOptions(screen.getByLabelText(/rsvp for kabir sethi/i), 'accepted')
    expect(screen.getByText(/confirmed of/i).textContent).not.toBe(before)
    expect(wedding().guests.find((g) => g.name === 'Kabir Sethi')?.rsvp).toBe('accepted')
  })

  it('adds a guest after validation and removes one', async () => {
    const user = userEvent.setup()
    renderApp('#/app/guests')
    await user.click(screen.getByRole('button', { name: /add guest/i }))
    const dialog = screen.getByRole('dialog', { name: /add guest/i })
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }))
    expect(within(dialog).getByText(/enter the guest name/i)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^name/i), 'Nisha Verma')
    await user.type(within(dialog).getByLabelText(/plus-ones/i), '{Backspace}12')
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }))
    expect(within(dialog).getByText(/0 to 10/i)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/plus-ones/i))
    await user.type(within(dialog).getByLabelText(/plus-ones/i), '2')
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }))
    expect(wedding().guests.find((g) => g.name === 'Nisha Verma')?.plusOnes).toBe(2)

    await user.click(screen.getByRole('button', { name: /remove nisha verma/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^remove$/i }))
    expect(wedding().guests.some((g) => g.name === 'Nisha Verma')).toBe(false)
  })
})

describe('my events', () => {
  it('lists, searches, filters, opens and deletes events', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events')
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)

    await user.type(screen.getByRole('searchbox', { name: /search events/i }), 'pune')
    expect(screen.getByRole('heading', { level: 2, name: /riverside neighbours/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: /kiara/i })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: /search events/i }))

    await user.click(screen.getByRole('button', { name: 'Birthdays' }))
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'All' }))

    await user.click(screen.getByRole('button', { name: /delete kiara/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }))
    expect(store.getState().events.some((e) => e.id === 'demo-birthday')).toBe(false)

    await user.click(screen.getByRole('button', { name: /open riverside/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /riverside neighbours/i })).toBeInTheDocument()
    expect(store.getState().activeEventId).toBe('demo-community')
  })

  it('shows an empty state with a way back after everything is deleted', async () => {
    const user = userEvent.setup()
    renderApp('#/app/budget')
    store.clearAll()
    expect(await screen.findByText(/no event selected/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /load sample events/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument()
  })
})

describe('dashboard', () => {
  it('summarises the active event and links to the right screens', async () => {
    renderApp('#/app/dashboard')
    expect(screen.getByRole('heading', { level: 1, name: /Aarav & Meera/ })).toBeInTheDocument()
    expect(screen.getByText('Sample event')).toBeInTheDocument()
    expect(screen.getByLabelText('96 days to go')).toBeInTheDocument()
    expect(screen.getByText(/rule-based, not live ai/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /budget committed/i })).toHaveAttribute('aria-valuenow', '88')
    expect(screen.getByRole('link', { name: /1 overdue task|overdue task/i })).toHaveAttribute('href', '#/app/timeline')
  })

  it('switches events from the sidebar', async () => {
    const user = userEvent.setup()
    renderApp('#/app/dashboard')
    await user.selectOptions(screen.getByLabelText('Planning'), 'demo-birthday')
    expect(await screen.findByRole('heading', { level: 1, name: /kiara/i })).toBeInTheDocument()
  })
})

describe('settings', () => {
  it('changes the currency display and the reduce-motion preference', async () => {
    const user = userEvent.setup()
    renderApp('#/app/settings')
    await user.selectOptions(screen.getByLabelText(/currency/i), 'USD')
    expect(store.getState().settings.currency).toBe('USD')
    await user.click(screen.getByRole('checkbox', { name: /reduce motion/i }))
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })

  it('resets to sample events after confirmation', async () => {
    const user = userEvent.setup()
    renderApp('#/app/settings')
    store.dispatch({ type: 'event/remove', id: 'demo-wedding' })
    await user.click(screen.getByRole('button', { name: /reset to sample events/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^reset$/i }))
    expect(store.getState().events).toHaveLength(3)
  })
})

describe('modal accessibility', () => {
  it('traps focus, closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<button>Trigger</button>)
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    trigger.focus()
    rerender(
      <>
        <button>Trigger</button>
        <Modal open title="Hello" onClose={onClose} footer={<button>Last</button>}>
          <input aria-label="Field" />
        </Modal>
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Hello' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Field')).toHaveFocus()

    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus() // wrapped around, never leaves the dialog
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()

    rerender(<button>Trigger</button>)
    expect(screen.getByRole('button', { name: 'Trigger' })).toHaveFocus()
  })
})



