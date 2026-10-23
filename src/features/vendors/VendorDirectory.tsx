import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button } from '../../components/ui/Button'
import { Badge, DemoTag, EmptyState, PageHeader } from '../../components/ui/Display'
import { SearchInput, SelectField } from '../../components/ui/Fields'
import { Icon } from '../../components/ui/Icon'
import { toast } from '../../components/ui/Toast'
import { CATEGORY_BY_ID, EVENT_TYPE_LABEL, VENDOR_CATEGORIES } from '../../data/constants'
import { DIRECTORY } from '../../data/directory'
import { formatMoney, newId } from '../../lib/format'
import { useDocumentTitle } from '../../hooks'
import { store, useSettings } from '../../state/store'
import type { CategoryId, EventPlan } from '../../types'
import './vendors.css'

export function VendorDirectoryPage() {
  useDocumentTitle('Vendor Directory')
  return <RequireEvent>{(event) => <Directory event={event} />}</RequireEvent>
}

function Directory({ event }: { event: EventPlan }) {
  const { currency } = useSettings()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [fitOnly, setFitOnly] = useState(true)
  const onList = useMemo(() => new Set(event.vendors.map((v) => v.directoryId).filter(Boolean)), [event.vendors])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return DIRECTORY.filter(
      (v) =>
        (category === 'all' || v.category === category) &&
        (!fitOnly || v.eventTypes.includes(event.type)) &&
        (!q || `${v.name} ${v.city} ${v.tags.join(' ')}`.toLowerCase().includes(q)),
    )
  }, [query, category, fitOnly, event.type])

  const add = (id: string) => {
    const v = DIRECTORY.find((d) => d.id === id)
    if (!v) return
    store.dispatch({
      type: 'item/upsert', eventId: event.id, collection: 'vendors',
      item: { id: newId(), category: v.category, name: v.name, status: 'to-research', quote: null, notes: `From demo directory (${v.city}).`, directoryId: v.id, manual: true },
    })
    toast(`${v.name} added to your checklist`)
  }

  return (
    <div className="vendors">
      <PageHeader eyebrow={event.name} title="Vendor Directory">
        Browse suppliers and add them to your checklist.
      </PageHeader>
      <div className="notice" role="note">
        <Icon name="info" size={18} />
        <p><strong>Demo directory.</strong> These vendors are fictional examples. Prices are illustrative and no availability, contact details or real bookings are connected in Phase 1.</p>
      </div>

      <div className="toolbar">
        <SearchInput label="Search directory" placeholder="Search by name, city or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as CategoryId | 'all')} className="toolbar__sort">
          <option value="all">All categories</option>
          {VENDOR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <label className="check-inline">
          <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} />
          Only vendors for {EVENT_TYPE_LABEL[event.type].toLowerCase()}s
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="search" title="No vendors match">Try another category or turn off the event-type filter.</EmptyState>
      ) : (
        <ul className="dir-grid" aria-label="Demo vendors">
          {rows.map((v) => {
            const added = onList.has(v.id)
            return (
              <li key={v.id} className="dir-card">
                <div className="dir-card__top">
                  <Badge tone="violet">{CATEGORY_BY_ID[v.category].label}</Badge>
                  <DemoTag>Demo</DemoTag>
                </div>
                <h2 className="dir-card__name">{v.name}</h2>
                <p className="muted">{v.blurb}</p>
                <p className="dir-card__meta">
                  <span><Icon name="pin" size={15} /> {v.city}</span>
                  <span><Icon name="star" size={15} /> {v.rating.toFixed(1)}</span>
                  <span>From {formatMoney(v.priceFrom, currency, true)}</span>
                </p>
                <p className="dir-card__tags">{v.tags.map((t) => <span key={t} className="tag">{t}</span>)}</p>
                {added ? (
                  <Button disabled icon="check">On your checklist</Button>
                ) : (
                  <Button variant="primary" icon="plus" onClick={() => add(v.id)}>Add to checklist<span className="sr-only">: {v.name}</span></Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted dir-foot">Added vendors appear in your <Link to="/app/vendors" className="link">Vendor Checklist</Link>.</p>
    </div>
  )
}

