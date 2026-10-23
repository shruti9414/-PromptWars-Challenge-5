import { useMemo, useState } from 'react'
import { CompareBars, DonutChart } from '../../components/charts/Charts'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, EmptyState, PageHeader, ProgressBar, StatCard } from '../../components/ui/Display'
import { SearchInput, SelectField } from '../../components/ui/Fields'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { CATEGORIES, CATEGORY_BY_ID } from '../../data/constants'
import { expenseCost, summarizeBudget, totalsByCategory } from '../../lib/budget'
import { downloadCsv } from '../../lib/csv'
import { formatMoney, formatPercent } from '../../lib/format'
import { useDocumentTitle } from '../../hooks'
import { store, useSettings } from '../../state/store'
import type { CategoryId, EventPlan, Expense } from '../../types'
import { BudgetTotalDialog, ExpenseDialog } from './dialogs'
import './budget.css'

export function BudgetPage() {
  useDocumentTitle('Budget')
  return (
    <RequireEvent>{(event) => <Budget event={event} />}</RequireEvent>
  )
}

function Budget({ event }: { event: EventPlan }) {
  const { currency } = useSettings()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  const money = (n: number) => formatMoney(n, currency)
  const compact = (n: number) => formatMoney(n, currency, true)
  const summary = useMemo(() => summarizeBudget(event.budget, event.expenses), [event.budget, event.expenses])
  const byCategory = useMemo(() => totalsByCategory(event.expenses), [event.expenses])
  const slices = byCategory.map((t) => ({ id: t.category, label: CATEGORY_BY_ID[t.category].label, value: t.committed, color: CATEGORY_BY_ID[t.category].color }))
  const bars = byCategory.map((t) => ({ id: t.category, label: CATEGORY_BY_ID[t.category].label, planned: t.planned, committed: t.committed, color: CATEGORY_BY_ID[t.category].color }))
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return event.expenses.filter((e) => (category === 'all' || e.category === category) && (!q || e.title.toLowerCase().includes(q)))
  }, [event.expenses, query, category])

  const save = (item: Expense) => {
    store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'expenses', item })
    toast(editing === 'new' ? 'Expense added' : 'Expense updated')
    setEditing(null)
  }

  const exportCsv = () => {
    downloadCsv(
      `${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-budget.csv`,
      ['Expense', 'Category', 'Planned', 'Actual', 'Paid'],
      event.expenses.map((e) => [e.title, CATEGORY_BY_ID[e.category].label, e.estimated, e.actual ?? '', e.paid ? 'Yes' : 'No']),
    )
    toast('Budget exported as CSV')
  }

  return (
    <div className="budget">
      <PageHeader
        eyebrow={event.name}
        title="Budget"
        actions={
          <>
            <Button icon="edit" onClick={() => setAdjusting(true)}>Adjust total</Button>
            <Button icon="download" onClick={exportCsv} disabled={event.expenses.length === 0}>Export CSV</Button>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add expense</Button>
          </>
        }
      >
        Planned vs. committed spend, updated live as you edit.
      </PageHeader>

      <div className="stat-grid">
        <StatCard label="Total budget" value={money(summary.total)} />
        <StatCard label="Committed" value={money(summary.committed)} note={`${formatPercent(summary.percentCommitted)} of budget`} tone={summary.percentCommitted > 90 ? 'warn' : undefined} />
        <StatCard label="Paid so far" value={money(summary.paid)} note={`${money(summary.committed - summary.paid)} still to pay`} />
        <StatCard
          label={summary.overBudget ? 'Over budget by' : 'Remaining'}
          value={money(summary.overBudget ? summary.overBy : summary.remaining)}
          tone={summary.overBudget ? 'danger' : 'ok'}
          note={summary.overBudget ? 'Reduce a category or raise the total' : `Plan covers ${money(summary.planned)}`}
        />
      </div>
      <ProgressBar value={summary.percentCommitted} label="Budget committed" tone={summary.overBudget ? 'danger' : summary.percentCommitted > 90 ? 'warn' : 'violet'} />

      <div className="budget__charts">
        <section className="card" aria-labelledby="b-split">
          <h2 id="b-split" className="card__title">Where the money goes</h2>
          {slices.length === 0 ? (
            <p className="muted">Add an expense to see the breakdown.</p>
          ) : (
            <DonutChart slices={slices} centerLabel="Committed" centerValue={compact(summary.committed)} format={compact}
              ariaLabel={`Committed spend by category, total ${compact(summary.committed)}`} />
          )}
        </section>
        <section className="card" aria-labelledby="b-bars">
          <h2 id="b-bars" className="card__title">Planned vs. committed</h2>
          {bars.length === 0 ? <p className="muted">Nothing to compare yet.</p> : <CompareBars rows={bars} format={compact} />}
        </section>
      </div>

      <section className="card" aria-labelledby="b-table">
        <div className="card__head">
          <h2 id="b-table" className="card__title">Expenses</h2>
          <span className="muted">{rows.length} of {event.expenses.length} shown</span>
        </div>
        <div className="toolbar toolbar--tight">
          <SearchInput label="Search expenses" placeholder="Search expenses" value={query} onChange={(e) => setQuery(e.target.value)} />
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as CategoryId | 'all')} className="toolbar__sort">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </SelectField>
        </div>
        {event.expenses.length === 0 ? (
          <EmptyState icon="wallet" title="No expenses yet" action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add the first expense</Button>}>
            Track what you plan to spend, then enter final amounts as quotes arrive.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon="search" title="No matching expenses">Clear the search or category filter.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Expenses for {event.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Expense</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">Planned</th>
                  <th scope="col" className="num">Actual</th>
                  <th scope="col">Paid</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="table__title">{e.title}</th>
                    <td><span className="cat"><span className="legend__dot" style={{ background: CATEGORY_BY_ID[e.category].color }} aria-hidden="true" />{CATEGORY_BY_ID[e.category].label}</span></td>
                    <td className="num">{money(e.estimated)}</td>
                    <td className="num">
                      {e.actual === null ? <span className="muted">Not billed</span> : <span className={expenseCost(e) > e.estimated ? 'text-danger' : undefined}>{money(e.actual)}</span>}
                    </td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={e.paid} onChange={() => { store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'expenses', item: { ...e, paid: !e.paid } }) }} />
                        <span className="switch__ui" aria-hidden="true" />
                        <span className="sr-only">Paid: {e.title}</span>
                      </label>
                      {e.paid && <Badge tone="ok">Paid</Badge>}
                    </td>
                    <td className="table__actions">
                      <IconButton icon="edit" label={`Edit ${e.title}`} onClick={() => setEditing(e)} />
                      <IconButton icon="trash" label={`Delete ${e.title}`} onClick={() => setDeleting(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ExpenseDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        expense={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      <BudgetTotalDialog
        key={adjusting ? 'open' : 'closed'}
        open={adjusting}
        total={event.budget}
        onClose={() => setAdjusting(false)}
        onSave={(total) => {
          store.dispatch({ type: 'event/update', id: event.id, patch: { budget: total } })
          toast('Budget updated')
          setAdjusting(false)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete "${deleting?.title ?? ''}"?`}
        message="This expense will be removed from the budget."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) store.dispatch({ type: 'item/remove', eventId: event.id, collection: 'expenses', itemId: deleting.id })
          toast('Expense deleted')
          setDeleting(null)
        }}
      />
    </div>
  )
}
