import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { RequireEvent } from '../../components/layout/RequireEvent'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, EmptyState, FilterChips, PageHeader, ProgressBar, StatCard } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Fields'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { GUEST_GROUP_LABEL, RSVP_LABEL } from '../../data/constants'
import { colIndex, downloadCsv, parseCsv, validateCsvFile } from '../../lib/csv'
import { newId } from '../../lib/format'
import { guestStats } from '../../lib/tasks'
import { cleanText, LIMITS, parseNumber } from '../../lib/validation'
import { useDocumentTitle } from '../../hooks'
import { store } from '../../state/store'
import type { EventPlan, Guest, GuestGroup, RsvpStatus } from '../../types'
import { GuestDialog } from './GuestDialog'
import './guests.css'

type Filter = RsvpStatus | 'all'
const RSVP_ORDER: RsvpStatus[] = ['accepted', 'pending', 'maybe', 'declined']
const GUEST_GROUPS: GuestGroup[] = ['family', 'friends', 'colleagues', 'community']
const rsvpTone = (r: RsvpStatus) => (r === 'accepted' ? 'ok' : r === 'declined' ? 'danger' : r === 'maybe' ? 'warn' : 'neutral')

/** Matches a CSV cell against enum ids or their display labels, case-insensitively. */
function matchEnum<T extends string>(raw: string, ids: T[], labels: Record<T, string>): T | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  return ids.find((id) => id.toLowerCase() === v) ?? ids.find((id) => labels[id].toLowerCase() === v) ?? null
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'event'

export function GuestsPage() {
  useDocumentTitle('Guests')
  return <RequireEvent>{(event) => <Guests event={event} />}</RequireEvent>
}

function Guests({ event }: { event: EventPlan }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Guest | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Guest | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stats = useMemo(() => guestStats(event.guests), [event.guests])

  const exportCsv = () => {
    downloadCsv(
      `${slug(event.name)}-guests.csv`,
      ['Name', 'Group', 'RSVP', 'Plus-ones', 'Dietary'],
      event.guests.map((g) => [g.name, GUEST_GROUP_LABEL[g.group], RSVP_LABEL[g.rsvp], g.plusOnes, g.dietary]),
    )
    toast('Guest list exported as CSV')
  }

  const importCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fileError = validateCsvFile(file)
    if (fileError) { toast(fileError); return }

    const rows = parseCsv(await file.text())
    const header = rows[0]
    const nameCol = header ? colIndex(header, 'Name') : -1
    if (!header || nameCol === -1) { toast('CSV needs a header row with a "Name" column.'); return }
    const groupCol = colIndex(header, 'Group')
    const rsvpCol = colIndex(header, 'RSVP')
    const plusCol = colIndex(header, 'Plus-ones')
    const dietaryCol = colIndex(header, 'Dietary')

    let imported = 0
    let skipped = 0
    for (const r of rows.slice(1, 2001)) {
      const name = cleanText(r[nameCol] ?? '')
      if (!name || name.length > LIMITS.title) { skipped++; continue }
      const group = (groupCol >= 0 ? matchEnum(r[groupCol] ?? '', GUEST_GROUPS, GUEST_GROUP_LABEL) : null) ?? 'friends'
      const rsvp = (rsvpCol >= 0 ? matchEnum(r[rsvpCol] ?? '', RSVP_ORDER, RSVP_LABEL) : null) ?? 'pending'
      const plusRaw = plusCol >= 0 ? parseNumber(r[plusCol] ?? '') : 0
      const plusOnes = plusRaw === null ? 0 : Math.min(Math.max(Math.round(plusRaw), 0), LIMITS.plusOnes)
      const dietary = cleanText(dietaryCol >= 0 ? (r[dietaryCol] ?? '') : '').slice(0, 60)
      store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'guests', item: { id: newId(), name, group, rsvp, plusOnes, dietary } })
      imported++
    }
    if (imported === 0) toast('No valid rows found — check the Name column.')
    else toast(skipped > 0 ? `Imported ${imported} guest${imported === 1 ? '' : 's'}, skipped ${skipped} invalid row${skipped === 1 ? '' : 's'}` : `Imported ${imported} guest${imported === 1 ? '' : 's'}`)
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return event.guests
      .filter((g) => (filter === 'all' || g.rsvp === filter) && (!q || `${g.name} ${g.dietary}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [event.guests, query, filter])

  const upsert = (item: Guest) => store.dispatch({ type: 'item/upsert', eventId: event.id, collection: 'guests', item })

  return (
    <div className="guests">
      <PageHeader eyebrow={event.name} title="Guest Management" actions={
        <>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={importCsv} aria-label="Import guests from CSV" />
          <Button icon="upload" onClick={() => fileInputRef.current?.click()}>Import CSV</Button>
          <Button icon="download" onClick={exportCsv} disabled={event.guests.length === 0}>Export CSV</Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add guest</Button>
        </>
      }>
        Track invitations and RSVPs. Names here are fictional demo data.
      </PageHeader>

      <div className="stat-grid">
        <StatCard label="Invited" value={stats.invited} note="households or people" />
        <StatCard label="Attending" value={stats.accepted} note={`${stats.confirmedHeadcount} people with plus-ones`} tone="ok" />
        <StatCard label="Awaiting reply" value={stats.pending} note={`${stats.maybe} maybe`} />
        <StatCard label="Declined" value={stats.declined} />
      </div>
      <div className="guests__capacity card">
        <p><strong>{stats.confirmedHeadcount}</strong> confirmed of <strong>{event.guestCount}</strong> planned. Up to <strong>{stats.potentialHeadcount}</strong> if every open reply is a yes.</p>
        <ProgressBar value={event.guestCount ? (stats.confirmedHeadcount / event.guestCount) * 100 : 0} label="Confirmed headcount against planned guests" tone={stats.confirmedHeadcount > event.guestCount ? 'danger' : 'violet'} showValue />
      </div>

      <div className="toolbar">
        <SearchInput label="Search guests" placeholder="Search by name or dietary need" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterChips<Filter> label="Filter by RSVP" value={filter} onChange={setFilter}
          options={[{ id: 'all', label: 'All' }, ...RSVP_ORDER.map((r) => ({ id: r, label: RSVP_LABEL[r] }))]} />
      </div>

      {event.guests.length === 0 ? (
        <EmptyState icon="users" title="No guests yet" action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add the first guest</Button>}>
          Add guests to track who has replied and who needs a nudge.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon="search" title="No matching guests">Adjust the search or RSVP filter.</EmptyState>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <caption className="sr-only">Guest list for {event.name}</caption>
            <thead>
              <tr>
                <th scope="col">Guest</th>
                <th scope="col">Group</th>
                <th scope="col">RSVP</th>
                <th scope="col" className="num">Plus-ones</th>
                <th scope="col">Dietary</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <th scope="row" className="table__title">{g.name}</th>
                  <td>{GUEST_GROUP_LABEL[g.group]}</td>
                  <td>
                    <label className="sr-only" htmlFor={`rsvp-${g.id}`}>RSVP for {g.name}</label>
                    <select id={`rsvp-${g.id}`} className={`status-select status-select--${rsvpTone(g.rsvp)}`} value={g.rsvp}
                      onChange={(e) => upsert({ ...g, rsvp: e.target.value as RsvpStatus })}>
                      {RSVP_ORDER.map((r) => <option key={r} value={r}>{RSVP_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="num">{g.plusOnes}</td>
                  <td>{g.dietary ? <Badge tone="blue">{g.dietary}</Badge> : <span className="muted">None noted</span>}</td>
                  <td className="table__actions">
                    <IconButton icon="edit" label={`Edit ${g.name}`} onClick={() => setEditing(g)} />
                    <IconButton icon="trash" label={`Remove ${g.name}`} onClick={() => setDeleting(g)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GuestDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        guest={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={(item) => { upsert(item); toast(editing === 'new' ? 'Guest added' : 'Guest updated'); setEditing(null) }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Remove ${deleting?.name ?? 'guest'}?`}
        message="This guest will be removed from the list."
        confirmLabel="Remove"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) store.dispatch({ type: 'item/remove', eventId: event.id, collection: 'guests', itemId: deleting.id })
          toast('Guest removed')
          setDeleting(null)
        }}
      />
    </div>
  )
}
