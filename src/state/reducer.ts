import type { AppState, EventPlan, Expense, Guest, Settings, Task, VendorBooking } from '../types'

interface Collections {
  expenses: Expense
  tasks: Task
  vendors: VendorBooking
  guests: Guest
}
export type CollectionName = keyof Collections

export type Action =
  | { type: 'event/add'; event: EventPlan }
  | { type: 'event/update'; id: string; patch: Partial<Omit<EventPlan, 'id'>> }
  | { type: 'event/remove'; id: string }
  | { type: 'event/setActive'; id: string }
  | { type: 'item/upsert'; eventId: string; collection: CollectionName; item: Collections[CollectionName] }
  | { type: 'item/remove'; eventId: string; collection: CollectionName; itemId: string }
  | { type: 'idea/toggle'; eventId: string; ideaId: string }
  | { type: 'vendor/favorite'; eventId: string; directoryId: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'state/replace'; state: AppState }

function mapEvent(state: AppState, id: string, fn: (e: EventPlan) => EventPlan): AppState {
  return { ...state, events: state.events.map((e) => (e.id === id ? fn(e) : e)) }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'event/add':
      return { ...state, events: [action.event, ...state.events], activeEventId: action.event.id }
    case 'event/update':
      return mapEvent(state, action.id, (e) => ({ ...e, ...action.patch }))
    case 'event/remove': {
      const events = state.events.filter((e) => e.id !== action.id)
      const activeEventId =
        state.activeEventId === action.id ? (events[0]?.id ?? null) : state.activeEventId
      return { ...state, events, activeEventId }
    }
    case 'event/setActive':
      return state.events.some((e) => e.id === action.id) ? { ...state, activeEventId: action.id } : state
    case 'item/upsert':
      return mapEvent(state, action.eventId, (e) => {
        const list = e[action.collection] as { id: string }[]
        const exists = list.some((i) => i.id === action.item.id)
        const next = exists ? list.map((i) => (i.id === action.item.id ? action.item : i)) : [...list, action.item]
        return { ...e, [action.collection]: next }
      })
    case 'item/remove':
      return mapEvent(state, action.eventId, (e) => ({
        ...e,
        [action.collection]: (e[action.collection] as { id: string }[]).filter((i) => i.id !== action.itemId),
      }))
    case 'idea/toggle':
      return mapEvent(state, action.eventId, (e) => ({
        ...e,
        savedIdeas: e.savedIdeas.includes(action.ideaId)
          ? e.savedIdeas.filter((i) => i !== action.ideaId)
          : [...e.savedIdeas, action.ideaId],
      }))
    case 'vendor/favorite':
      return mapEvent(state, action.eventId, (e) => {
        const cur = e.favoriteVendors ?? []
        return { ...e, favoriteVendors: cur.includes(action.directoryId) ? cur.filter((i) => i !== action.directoryId) : [...cur, action.directoryId] }
      })
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'state/replace':
      return action.state
    default:
      return state
  }
}
