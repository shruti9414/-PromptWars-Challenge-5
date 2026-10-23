import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button, ButtonLink, IconButton } from '../../components/ui/Button'
import { Badge, DemoTag, EmptyState, FilterChips, PageHeader, ProgressBar } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Fields'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { CATEGORY_BY_ID, VENDOR_STATUSES, VENDOR_STATUS_LABEL } from '../../data/constants'
import { formatDate } from '../../lib/dates'
import { formatMoney, newId } from '../../lib/format'
import { vendorProgress } from '../../lib/tasks'
import { useDocumentTitle } from '../../hooks'
import { store, useSettings } from '../../state/store'
import type { EventPlan, Expense, VendorBooking, VendorStatus } from '../../types'
import { VendorDialog } from './VendorDialog'
import './vendors.css'

type StatusFilter = VendorStatus | 'all'

export function statusTone(s: VendorStatus) {
  return s === 'booked' || s === 'completed' ? 'ok' : s === 'declined' ? 'danger' : s === 'to-research' ? 'neutral' : 'blue'
}

/**
 * Keeps a vendor's budget line in sync: booking (or completing) a vendor with a quote creates one
 * linked expense, and later quote changes update that same expense's planned amount. Nothing is
 * deleted if the vendor is later unbooked — the user may already be tracking payment against it.
 */
function syncVendorExpense(event: EventPlan, vendor: VendorBooking): VendorBooking {
  const isBooked = vendor.status === 'booked' || vendor.status === 'completed'
  if (!isBooked || vendor.quote === null) return vendor

  const linked = vendor.linkedExpenseId ? event.expenses.find((e) => e.id === vendor.linkedExpenseId) : undefined
  if (linked) {
    if (linked.estimated !== vendor.quote) {
      store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'expenses', item: { ...linked, estimated: vendor.quote } })
    }
    return vendor
  }

  const expense: Expense = {
    id: newId(),
    title: `${vendor.name} (vendor)`,
    category: vendor.category,
    estimated: vendor.quote,
    actual: null,
    paid: false,
    manual: true,
    vendorId: vendor.id,
  }
  store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'expenses', item: expense })
  toast(`${vendor.name}: added to Budget as an expense`)
  return { ...vendor, linkedExpenseId: expense.id }
}

export function VendorChecklistPage() {
  useDocumentTitle('Vendor Checklist')
  return <RequireEvent>{(event) => <Checklist event={event} />}</RequireEvent>
}

function Checklist({ event }: { event: EventPlan }) {
  const { currency } = useSettings()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<VendorBooking | 'new' | null>(null)
  const [deleting, setDeleting] = useState<VendorBooking | null>(null)
  const progress = vendorProgress(event.vendors)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return event.vendors.filter((v) => (status === 'all' || v.status === status) && (!q || `${v.name} ${CATEGORY_BY_ID[v.category].label}`.toLowerCase().includes(q)))
  }, [event.vendors, query, status])

  const upsert = (item: VendorBooking) => store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'vendors', item: syncVendorExpense(event, item) })

  return (
    <div className="vendors">
      <PageHeader eyebrow={event.name} title="Vendor Checklist" actions={
        <>
          <ButtonLink to="/app/vendors/directory" icon="compass">Browse directory</ButtonLink>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add vendor</Button>
        </>
      }>
        Track every supplier from first idea to signed booking.
      </PageHeader>

      <div className="card vendors__summary">
        <div>
          <p className="stat__label">Booked</p>
          <p className="stat__value">{progress.booked} of {progress.total}</p>
        </div>
        <div className="vendors__bar"><ProgressBar value={progress.percent} label="Vendors booked" tone="ok" showValue /></div>
        <DemoTag>Statuses are tracked by you; nothing is sent to vendors</DemoTag>
      </div>

      <div className="toolbar">
        <SearchInput label="Search vendors" placeholder="Search vendors or categories" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterChips<StatusFilter> label="Filter by booking status" value={status} onChange={setStatus}
          options={[{ id: 'all', label: 'All' }, ...VENDOR_STATUSES.map((s) => ({ id: s, label: VENDOR_STATUS_LABEL[s] }))]} />
      </div>

      {event.vendors.length === 0 ? (
        <EmptyState icon="store" title="No vendors yet" action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add a vendor</Button>}>
          Add the suppliers you need, or pick from the demo directory.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon="search" title="No matching vendors">Adjust the search or status filter.</EmptyState>
      ) : (
        <ul className="vendor-list">
          {rows.map((v) => {
            const cat = CATEGORY_BY_ID[v.category]
            return (
              <li key={v.id} className={`vendor-row${v.status === 'booked' || v.status === 'completed' ? ' is-booked' : ''}`}>
                <span className="vendor-row__cat" style={{ background: cat.color }} aria-hidden="true" />
                <div className="vendor-row__main">
                  <p className="vendor-row__cat-label">{cat.label}</p>
                  <h2 className="vendor-row__name">{v.name}</h2>
                  {v.requirement && <p className="vendor-row__req">{v.requirement}</p>}
                  {v.criteria && v.criteria.length > 0 && <ul className="plain-list muted vendor-row__crit" aria-label="Search criteria">{v.criteria.map((c) => <li key={c}>{c}</li>)}</ul>}
                  {(v.bookBy || v.priority) && <p className="vendor-row__book">{v.priority === 'book-first' && <Badge tone="danger">Book first</Badge>} {v.bookBy && <>Book by {formatDate(v.bookBy, 'short')}</>}</p>}
                  {v.notes && <p className="muted vendor-row__notes">{v.notes}</p>}
                </div>
                <p className="vendor-row__quote">
                  {v.quote !== null ? <><span className="muted">Quote</span> {formatMoney(v.quote, currency)}</> : <span className="muted">No quote yet</span>}
                  {v.linkedExpenseId && <Link to="/app/budget" className="vendor-row__linked">In Budget &rarr;</Link>}
                </p>
                <div className="vendor-row__status">
                  <label className="sr-only" htmlFor={`status-${v.id}`}>Booking status for {v.name}</label>
                  <select id={`status-${v.id}`} className={`status-select status-select--${statusTone(v.status)}`} value={v.status}
                    onChange={(e) => { upsert({ ...v, status: e.target.value as VendorStatus }); toast(`${v.name}: ${VENDOR_STATUS_LABEL[e.target.value as VendorStatus]}`) }}>
                    {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{VENDOR_STATUS_LABEL[s]}</option>)}
                  </select>
                  {(v.status === 'booked' || v.status === 'completed') && <Badge tone="ok">Confirmed by you</Badge>}
                </div>
                <div className="vendor-row__actions">
                  <IconButton icon="edit" label={`Edit ${v.name}`} onClick={() => setEditing(v)} />
                  <IconButton icon="trash" label={`Remove ${v.name}`} onClick={() => setDeleting(v)} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <VendorDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        vendor={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={(item) => { upsert(item); toast(editing === 'new' ? 'Vendor added' : 'Vendor updated'); setEditing(null) }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Remove "${deleting?.name ?? ''}"?`}
        message="This vendor will be removed from the checklist."
        confirmLabel="Remove"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) store.dispatch({ type: 'item/remove', eventId: event.id, collection: 'vendors', itemId: deleting.id })
          toast('Vendor removed')
          setDeleting(null)
        }}
      />
    </div>
  )
}


