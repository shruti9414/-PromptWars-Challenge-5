import type {
  CategoryId,
  VenueStatus,
  EventType,
  GuestGroup,
  Priority,
  RsvpStatus,
  VendorStatus,
} from '../types'

export const IMG = {
  weddingBouquet: '/img/wedding-bouquet.webp',
  weddingRings: '/img/wedding-rings.webp',
  weddingFeast: '/img/wedding-feast.webp',
  weddingTable: '/img/wedding-table.webp',
  balloons: '/img/balloons.webp',
  birthdayTreats: '/img/birthday-treats.webp',
  cake: '/img/cake.webp',
  communitySunset: '/img/community-sunset.webp',
  communityFriends: '/img/community-friends.webp',
  communityHall: '/img/community-hall.webp',
  dinner: '/img/dinner.webp',
} as const

export interface EventTypeMeta {
  id: EventType
  label: string
  tagline: string
  image: string
  defaultGuests: number
  defaultBudget: number
}

export const EVENT_TYPES: EventTypeMeta[] = [
  {
    id: 'wedding',
    label: 'Wedding',
    tagline: 'Ceremony, reception and every ritual in between.',
    image: IMG.weddingBouquet,
    defaultGuests: 150,
    defaultBudget: 2500000,
  },
  {
    id: 'birthday',
    label: 'Birthday',
    tagline: 'Milestones and surprises, from first to fiftieth.',
    image: IMG.balloons,
    defaultGuests: 40,
    defaultBudget: 150000,
  },
  {
    id: 'anniversary',
    label: 'Anniversary',
    tagline: 'Silver, golden or first: celebrate the years together.',
    image: IMG.dinner,
    defaultGuests: 60,
    defaultBudget: 400000,
  },
  {
    id: 'community',
    label: 'Community event',
    tagline: 'Meetups, fundraisers, festivals and neighbourhood days.',
    image: IMG.communitySunset,
    defaultGuests: 120,
    defaultBudget: 300000,
  },
]

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  community: 'Community',
}

export interface CategoryMeta {
  id: CategoryId
  label: string
  color: string
}

/** Chart colours are paired with text labels everywhere, never colour-only. */
export const CATEGORIES: CategoryMeta[] = [
  { id: 'venue', label: 'Venue', color: '#3f2fb8' },
  { id: 'catering', label: 'Catering', color: '#2f6bff' },
  { id: 'decor', label: 'Decor & florals', color: '#8b5cf6' },
  { id: 'photo', label: 'Photo & video', color: '#0e9bd8' },
  { id: 'music', label: 'Music & entertainment', color: '#d946a8' },
  { id: 'attire', label: 'Attire & styling', color: '#14a37f' },
  { id: 'stationery', label: 'Invites & stationery', color: '#e08a1e' },
  { id: 'transport', label: 'Transport', color: '#5b6b8c' },
  { id: 'favors', label: 'Gifts & favours', color: '#c2410c' },
  { id: 'activities', label: 'Activities & games', color: '#0f766e' },
  { id: 'contingency', label: 'Contingency', color: '#8a93a8' },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  CategoryMeta
>

export const VENDOR_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'contingency')

export interface ThemeMeta {
  id: string
  label: string
  blurb: string
  swatches: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: 'midnight-garden', label: 'Midnight Garden', blurb: 'Deep navy, candlelight and lush greenery.', swatches: ['#0b1033', '#7c5cff', '#cfe3d4'] },
  { id: 'golden-hour', label: 'Golden Hour', blurb: 'Warm amber, blush and soft linen.', swatches: ['#e9a23b', '#f6d8c0', '#fff7ec'] },
  { id: 'modern-minimal', label: 'Modern Minimal', blurb: 'Clean lines, white space and one bold accent.', swatches: ['#ffffff', '#111827', '#2f6bff'] },
  { id: 'boho-wildflower', label: 'Boho Wildflower', blurb: 'Dried grasses, terracotta and relaxed seating.', swatches: ['#c2683f', '#e8d5b5', '#7a8f5b'] },
  { id: 'neon-night', label: 'Neon Night', blurb: 'High-energy lights, dark room, big sound.', swatches: ['#120a3a', '#ff3db8', '#32e0ff'] },
  { id: 'pastel-picnic', label: 'Pastel Picnic', blurb: 'Soft pinks, mint and daytime outdoors.', swatches: ['#f8c8dc', '#c8f0e0', '#fff4c9'] },
  { id: 'black-tie', label: 'Classic Black Tie', blurb: 'Formal, timeless and elegantly restrained.', swatches: ['#111111', '#d6b36a', '#f4f1ea'] },
  { id: 'festival-bright', label: 'Festival Bright', blurb: 'Bunting, marigold and joyful colour everywhere.', swatches: ['#ff7a1a', '#ffd23f', '#1fa971'] },
]

export const PREFERENCES = [
  'Vegetarian-friendly',
  'Vegan options',
  'Halal',
  'Jain-friendly',
  'Outdoor',
  'Indoor',
  'Live music',
  'DJ',
  'Kids-friendly',
  'Alcohol-free',
  'Photo booth',
  'Eco-friendly',
  'Accessible venue',
  'Budget-conscious',
] as const

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  pending: 'Awaiting reply',
  accepted: 'Attending',
  maybe: 'Maybe',
  declined: 'Declined',
}

export const GUEST_GROUP_LABEL: Record<GuestGroup, string> = {
  family: 'Family',
  friends: 'Friends',
  colleagues: 'Colleagues',
  community: 'Community',
}

export const VENDOR_STATUSES: VendorStatus[] = [
  'to-research',
  'contacted',
  'quote-received',
  'booked',
  'completed',
  'declined',
]

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  'to-research': 'Needed',
  contacted: 'Contacted',
  'quote-received': 'Quote received',
  booked: 'Booked',
  completed: 'Completed',
  declined: 'Declined',
}

export function coverFor(type: EventType): string {
  return EVENT_TYPES.find((t) => t.id === type)?.image ?? IMG.weddingBouquet
}

export const VENUE_STATUS_LABEL: Record<VenueStatus, string> = {
  'not-started': 'Not started',
  shortlisting: 'Shortlisting venues',
  booked: 'Venue booked',
  'own-space': 'Using our own space',
}

/** Planning priorities a user can pick. category is the budget line the AI should favour. */
export const PRIORITY_OPTIONS: { id: string; category: CategoryId | null }[] = [
  { id: 'Food & catering', category: 'catering' },
  { id: 'Photography & video', category: 'photo' },
  { id: 'Decor & ambience', category: 'decor' },
  { id: 'Music & entertainment', category: 'music' },
  { id: 'Venue', category: 'venue' },
  { id: 'Activities for guests', category: 'activities' },
  { id: 'Keeping costs low', category: null },
  { id: 'Guest comfort & accessibility', category: null },
]
export const MAX_PRIORITIES = 4
