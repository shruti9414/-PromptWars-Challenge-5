import type { PlanRevision, StoredAiPlan } from './ai/schema'
export type EventType = 'wedding' | 'birthday' | 'community'
export type Priority = 'low' | 'medium' | 'high'
export type RsvpStatus = 'pending' | 'accepted' | 'maybe' | 'declined'
export type GuestGroup = 'family' | 'friends' | 'colleagues' | 'community'
export type VendorStatus = 'to-research' | 'contacted' | 'quote-received' | 'booked' | 'completed' | 'declined'
export type VenueStatus = 'not-started' | 'shortlisting' | 'booked' | 'own-space'
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP'

/** Shared by budget lines and vendor checklist entries. */
export type CategoryId =
  | 'venue'
  | 'catering'
  | 'decor'
  | 'photo'
  | 'music'
  | 'attire'
  | 'stationery'
  | 'transport'
  | 'favors'
  | 'activities'
  | 'contingency'

export interface Expense {
  id: string
  title: string
  category: CategoryId
  /** Planned cost. */
  estimated: number
  /** Final quoted/billed cost, once known. */
  actual: number | null
  paid: boolean
  /** True once the user added or edited it by hand. AI regeneration never replaces these. */
  manual?: boolean
  /** Set when this line was created from booking a vendor in the checklist. */
  vendorId?: string
}

export interface Task {
  id: string
  title: string
  /** ISO date, yyyy-mm-dd. */
  dueDate: string
  priority: Priority
  done: boolean
  category?: CategoryId
  description?: string
  /** Ids of tasks that must be finished first. */
  dependsOn?: string[]
  bookingDeadline?: boolean
  /** Suggested completion order from the planner. */
  order?: number
  manual?: boolean
}

export interface VendorBooking {
  id: string
  category: CategoryId
  name: string
  status: VendorStatus
  quote: number | null
  notes: string
  /** Set when added from the demo vendor directory. */
  directoryId?: string
  /** What the vendor must provide (generated requirement, not a real business). */
  requirement?: string
  criteria?: string[]
  bookBy?: string
  priority?: 'book-first' | 'high' | 'medium' | 'low'
  manual?: boolean
  /** Id of the budget expense auto-created from this vendor's quote once booked. */
  linkedExpenseId?: string
}

export interface Guest {
  id: string
  name: string
  group: GuestGroup
  rsvp: RsvpStatus
  plusOnes: number
  dietary: string
}

export interface EventPlan {
  id: string
  type: EventType
  name: string
  date: string
  location: string
  guestCount: number
  budget: number
  theme: string
  preferences: string[]
  notes: string
  coverImage: string
  isDemo: boolean
  createdAt: string
  expenses: Expense[]
  tasks: Task[]
  vendors: VendorBooking[]
  guests: Guest[]
  savedIdeas: string[]
  venueStatus?: VenueStatus
  priorities?: string[]
  aiPlan?: StoredAiPlan
  revisions?: PlanRevision[]
}

/** Validated, trimmed values collected by the event wizard. */
export interface EventInput {
  type: EventType
  name: string
  date: string
  location: string
  guestCount: number
  budget: number
  theme: string
  preferences: string[]
  notes: string
  venueStatus: VenueStatus
  priorities: string[]
}

/** Raw form state of the wizard (everything is a string until validated). */
export interface EventDraft {
  type: EventType | ''
  name: string
  date: string
  location: string
  guestCount: string
  budget: string
  theme: string
  venueStatus: VenueStatus | ''
  priorities: string[]
  preferences: string[]
  notes: string
  useSuggestedPlan: boolean
}

export interface Settings {
  currency: Currency
  displayName: string
  reduceMotion: boolean
}

export interface AppState {
  events: EventPlan[]
  activeEventId: string | null
  settings: Settings
}

export interface DirectoryVendor {
  id: string
  name: string
  category: CategoryId
  city: string
  priceFrom: number
  rating: number
  tags: string[]
  eventTypes: EventType[]
  blurb: string
}

export interface Idea {
  id: string
  title: string
  description: string
  eventTypes: EventType[]
  category: 'decor' | 'food' | 'entertainment' | 'favors' | 'activities' | 'venue' | 'palette'
  cost: 1 | 2 | 3
  image?: string
  swatches?: string[]
}

