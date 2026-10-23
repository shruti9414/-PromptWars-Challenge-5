import { addDays } from '../lib/dates'
import { newId } from '../lib/format'
import { templatePlanner } from '../lib/planner'
import type { AppState, EventInput, EventPlan, Expense, Guest, Task, VendorBooking } from '../types'
import { IMG, coverFor } from './constants'

export const DEFAULT_SETTINGS: AppState['settings'] = {
  currency: 'INR',
  displayName: 'Guest planner',
  reduceMotion: false,
}

const DEMO_GUESTS: Omit<Guest, 'id'>[] = [
  ['Anika Rao', 'family', 'accepted', 2, ''],
  ['Rohan Rao', 'family', 'accepted', 1, 'Vegetarian'],
  ['Devika Menon', 'family', 'accepted', 0, ''],
  ['Kabir Sethi', 'family', 'pending', 1, ''],
  ['Ishita Nair', 'family', 'accepted', 1, 'No nuts'],
  ['Vikram Shah', 'friends', 'accepted', 1, ''],
  ['Naina Kapoor', 'friends', 'accepted', 0, 'Vegan'],
  ['Arjun Bedi', 'friends', 'maybe', 1, ''],
  ['Sanya Mirza', 'friends', 'pending', 0, ''],
  ['Tanvi Joshi', 'friends', 'accepted', 2, ''],
  ['Dev Malhotra', 'friends', 'declined', 0, ''],
  ['Rhea Fernandes', 'friends', 'pending', 1, 'Vegetarian'],
  ['Kunal Iyer', 'colleagues', 'accepted', 0, ''],
  ['Pooja Desai', 'colleagues', 'pending', 1, ''],
  ['Samir Qureshi', 'colleagues', 'maybe', 0, 'Halal'],
  ['Leela Banerjee', 'family', 'accepted', 3, ''],
  ['Aditya Khanna', 'family', 'pending', 2, ''],
  ['Mira Choudhury', 'friends', 'accepted', 1, ''],
  ['Yash Patel', 'colleagues', 'declined', 0, ''],
  ['Zoya Ahmed', 'friends', 'pending', 0, ''],
].map(([name, group, rsvp, plusOnes, dietary]) => ({
  name: name as string,
  group: group as Guest['group'],
  rsvp: rsvp as Guest['rsvp'],
  plusOnes: plusOnes as number,
  dietary: dietary as string,
}))

function weddingSample(today: string): EventPlan {
  const at = (days: number) => addDays(today, days)
  const exp = (title: string, category: Expense['category'], estimated: number, actual: number | null, paid: boolean): Expense => ({
    id: newId(), title, category, estimated, actual, paid,
  })
  const task = (title: string, due: number, priority: Task['priority'], done: boolean, category?: Task['category']): Task => ({
    id: newId(), title, dueDate: at(due), priority, done, category,
  })
  const vendor = (
    category: VendorBooking['category'],
    name: string,
    status: VendorBooking['status'],
    quote: number | null,
    notes = '',
    directoryId?: string,
  ): VendorBooking => ({ id: newId(), category, name, status, quote, notes, directoryId })

  return {
    id: 'demo-wedding',
    type: 'wedding',
    name: 'Aarav & Meera’s Wedding',
    date: at(96),
    location: 'Udaipur, Rajasthan',
    guestCount: 180,
    budget: 2800000,
    theme: 'midnight-garden',
    preferences: ['Vegetarian-friendly', 'Outdoor', 'Live music', 'Photo booth'],
    venueStatus: 'booked',
    priorities: ['Food & catering', 'Photography & video'],
    notes: 'Sample event. Garden ceremony at sunset, reception under lights.',
    coverImage: IMG.weddingBouquet,
    isDemo: true,
    createdAt: at(-60),
    expenses: [
      exp('Lakeside venue hire', 'venue', 650000, 680000, true),
      exp('Catering (3 meals, 180 guests)', 'catering', 700000, 720000, false),
      exp('Floral and stage decor', 'decor', 230000, null, false),
      exp('Photo and video team', 'photo', 200000, 185000, true),
      exp('Live band and DJ', 'music', 150000, null, false),
      exp('Bridal and groom outfits', 'attire', 190000, 205000, true),
      exp('Invitations and stationery', 'stationery', 50000, 42000, true),
      exp('Guest transport shuttles', 'transport', 75000, null, false),
      exp('Return gifts', 'favors', 40000, null, false),
      exp('Contingency reserve', 'contingency', 125000, null, false),
    ],
    tasks: [
      task('Fix the guest list and city shortlist', -80, 'high', true),
      task('Visit and book the venue', -60, 'high', true, 'venue'),
      task('Book photographer and videographer', -50, 'high', true, 'photo'),
      task('Finalise caterer and tasting', -4, 'high', false, 'catering'),
      task('Shop for outfits and book fittings', 6, 'medium', false, 'attire'),
      task('Send save-the-dates', -20, 'medium', true, 'stationery'),
      task('Book music, DJ or band', 12, 'medium', false, 'music'),
      task('Confirm decor and floral concept', 24, 'medium', false, 'decor'),
      task('Send formal invitations', 38, 'high', false, 'stationery'),
      task('Arrange guest transport and stays', 52, 'medium', false, 'transport'),
      task('Collect RSVPs and finalise headcount', 75, 'high', false),
      task('Run the day-of schedule with vendors', 89, 'high', false),
      task('Settle final vendor payments', 93, 'medium', false),
    ],
    vendors: [
      vendor('venue', 'Lakeview Palace Gardens (Demo)', 'booked', 680000, 'Deposit paid. Sunset ceremony slot confirmed.', 'dv-venue-1'),
      vendor('catering', 'Saffron & Salt Caterers (Demo)', 'quote-received', 720000, 'Tasting pending.', 'dv-cater-1'),
      vendor('photo', 'Frame & Fable Studio (Demo)', 'booked', 185000, '2 photographers + drone.', 'dv-photo-1'),
      vendor('decor', 'Bloom Atelier (Demo)', 'contacted', null, 'Sent moodboard, waiting on estimate.', 'dv-decor-1'),
      vendor('music', 'Midnight Raga Collective (Demo)', 'to-research', null),
      vendor('attire', 'Outfits and stylist', 'booked', 205000, 'Fittings scheduled.'),
      vendor('stationery', 'Ink & Ivory Press (Demo)', 'booked', 42000, '', 'dv-stat-1'),
      vendor('transport', 'Transport provider', 'to-research', null),
    ],
    guests: DEMO_GUESTS.map((g) => ({ ...g, id: newId() })),
    savedIdeas: ['idea-fairy-lights', 'idea-palette-midnight'],
  }
}

function generated(
  id: string,
  today: string,
  input: EventInput,
  cover: string,
  doneCount: number,
  notes: string,
): EventPlan {
  const plan = templatePlanner.generate(input, today)
  const tasks = plan.tasks.map((t, i) => ({ ...t, done: i < doneCount }))
  return {
    ...input,
    notes,
    id,
    coverImage: cover || coverFor(input.type),
    isDemo: true,
    createdAt: addDays(today, -14),
    expenses: plan.expenses,
    tasks,
    vendors: plan.vendors,
    guests: [],
    savedIdeas: [],
  }
}

export function createDemoEvents(today: string): EventPlan[] {
  return [
    weddingSample(today),
    generated(
      'demo-birthday',
      today,
      {
        type: 'birthday',
        name: 'Kiara’s 30th Rooftop Party',
        date: addDays(today, 38),
        location: 'Mumbai, Maharashtra',
        guestCount: 60,
        budget: 250000,
        theme: 'neon-night',
        preferences: ['DJ', 'Photo booth', 'Alcohol-free'],
        notes: '',
        venueStatus: 'shortlisting',
        priorities: ['Music & entertainment', 'Decor & ambience'],
      },
      IMG.cake,
      2,
      'Sample event. Rooftop party with a dessert table and DJ set.',
    ),
    generated(
      'demo-community',
      today,
      {
        type: 'community',
        name: 'Riverside Neighbours Festival',
        date: addDays(today, 61),
        location: 'Pune, Maharashtra',
        guestCount: 250,
        budget: 400000,
        theme: 'festival-bright',
        preferences: ['Outdoor', 'Kids-friendly', 'Eco-friendly'],
        notes: '',
        venueStatus: 'not-started',
        priorities: ['Keeping costs low', 'Guest comfort & accessibility'],
      },
      IMG.communityFriends,
      1,
      'Sample event. Food stalls, local music and a kids’ corner.',
    ),
  ]
}

export function createDemoState(today: string): AppState {
  return {
    events: createDemoEvents(today),
    activeEventId: 'demo-wedding',
    settings: { ...DEFAULT_SETTINGS },
  }
}


