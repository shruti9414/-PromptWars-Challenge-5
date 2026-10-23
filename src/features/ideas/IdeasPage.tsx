import { useMemo, useState } from 'react'
import { DemoTag, EmptyState, FilterChips, PageHeader } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Fields'
import { Icon } from '../../components/ui/Icon'
import { toast } from '../../components/ui/Toast'
import { EVENT_TYPE_LABEL } from '../../data/constants'
import { IDEAS } from '../../data/ideas'
import { useDocumentTitle } from '../../hooks'
import { store, useActiveEvent } from '../../state/store'
import type { EventType, Idea } from '../../types'
import './ideas.css'

type TypeFilter = EventType | 'all'
type CategoryFilter = Idea['category'] | 'all'
type CostFilter = '0' | '1' | '2' | '3'

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'decor', label: 'Decor' },
  { id: 'food', label: 'Food' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'activities', label: 'Activities' },
  { id: 'favors', label: 'Favours' },
  { id: 'venue', label: 'Venue' },
  { id: 'palette', label: 'Palettes' },
]

export function IdeasPage() {
  useDocumentTitle('Ideas Gallery')
  const event = useActiveEvent()
  const [type, setType] = useState<TypeFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [cost, setCost] = useState<CostFilter>('0')
  const [query, setQuery] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const saved = event?.savedIdeas

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return IDEAS.filter(
      (i) =>
        (type === 'all' || i.eventTypes.includes(type)) &&
        (category === 'all' || i.category === category) &&
        (cost === '0' || i.cost === Number(cost)) &&
        (!savedOnly || saved?.includes(i.id)) &&
        (!q || `${i.title} ${i.description}`.toLowerCase().includes(q)),
    )
  }, [type, category, cost, query, savedOnly, saved])

  const toggleSave = (idea: Idea) => {
    if (!event) return
    store.dispatch({ type: 'idea/toggle', eventId: event.id, ideaId: idea.id })
    toast(saved?.includes(idea.id) ? 'Removed from saved ideas' : `Saved to ${event.name}`)
  }

  return (
    <div className="ideas">
      <PageHeader eyebrow="Inspiration" title="Ideas Gallery" actions={<DemoTag>Curated samples, not AI-generated</DemoTag>}>
        Browse curated ideas and save favourites to your event{event ? `: ${event.name}` : ''}.
      </PageHeader>

      <div className="ideas__filters">
        <SearchInput label="Search ideas" placeholder="Search ideas" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterChips<TypeFilter> label="Filter by event type" value={type} onChange={setType}
          options={[{ id: 'all', label: 'Every event' }, { id: 'wedding', label: 'Weddings' }, { id: 'birthday', label: 'Birthdays' }, { id: 'anniversary', label: 'Anniversaries' }, { id: 'community', label: 'Community' }]} />
        <FilterChips<CategoryFilter> label="Filter by category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        <FilterChips<CostFilter> label="Filter by cost" value={cost} onChange={setCost}
          options={[{ id: '0', label: 'Any cost' }, { id: '1', label: 'Budget-friendly' }, { id: '2', label: 'Mid-range' }, { id: '3', label: 'Splurge' }]} />
        <label className="check-inline">
          <input type="checkbox" checked={savedOnly} disabled={!event} onChange={(e) => setSavedOnly(e.target.checked)} />
          Saved ideas only{event ? ` (${saved?.length ?? 0})` : ''}
        </label>
      </div>

      <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? 'idea' : 'ideas'}</p>

      {shown.length === 0 ? (
        <EmptyState icon="sparkles" title="No ideas match those filters">Loosen a filter or clear the search.</EmptyState>
      ) : (
        <ul className="idea-grid" aria-label="Ideas">
          {shown.map((idea) => {
            const isSaved = Boolean(saved?.includes(idea.id))
            return (
              <li key={idea.id} className="idea">
                {idea.image ? (
                  <img src={idea.image} alt="" loading="lazy" width="400" height="260" className="idea__img" />
                ) : (
                  <div className="idea__palette" aria-label={`Colour swatches: ${idea.swatches?.join(', ')}`} role="img">
                    {idea.swatches?.map((c) => <span key={c} style={{ background: c }} />)}
                  </div>
                )}
                <div className="idea__body">
                  <p className="idea__meta">
                    {idea.category} &middot; <span aria-label={`Cost level ${idea.cost} of 3`}>{'$'.repeat(idea.cost)}</span>
                  </p>
                  <h2 className="idea__title">{idea.title}</h2>
                  <p className="muted">{idea.description}</p>
                  <p className="idea__types">{idea.eventTypes.map((t) => EVENT_TYPE_LABEL[t]).join(' · ')}</p>
                </div>
                <button type="button" className={`idea__save${isSaved ? ' is-saved' : ''}`} aria-pressed={isSaved} disabled={!event} onClick={() => toggleSave(idea)}>
                  <Icon name="heart" size={18} />
                  <span className="sr-only">{isSaved ? 'Unsave' : 'Save'} {idea.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
