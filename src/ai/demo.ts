import { CATEGORY_BY_ID, EVENT_TYPE_LABEL, PRIORITY_OPTIONS } from '../data/constants'
import { daysBetween, formatDate } from '../lib/dates'
import { SHARES, TASKS, VENDOR_CATEGORIES } from '../lib/planner'
import { allocateBudget } from '../lib/budget'
import type { CategoryId, EventType } from '../types'
import { CONTINGENCY_MIN } from './budget'
import type { AiContext, AssistantReply, CurrentSnapshot, FullPlan, Patch, SectionKey, TimelineItemAI, VendorRequirementAI } from './schema'

/*
 * Deterministic stand-in used when no AI API key is configured. It reads the same context a live model
 * would and produces plans that differ by event type, date, guests, budget, theme and preferences,
 * but it is rule-based text assembly. Everything built from it is labelled "demo" in the UI.
 */

const has = (ctx: AiContext, pref: string) => ctx.preferences.includes(pref)

const DECOR: Record<EventType, string[]> = {
  wedding: ['Layered candlelight and fairy lights over the main seating', 'A statement entrance arch in seasonal flowers', 'Table runners and place cards that echo the colour palette', 'A framed welcome board with the couple’s story'],
  birthday: ['A balloon garland framing the dessert table', 'Photo wall with personal milestones of the guest of honour', 'Themed table settings and a banner at the entrance', 'String lights for evening atmosphere'],
  community: ['Clear, large-print signage so every stall and exit is easy to find', 'Bunting and banners in the community’s colours', 'Seating clusters with a welcome table at the entrance', 'A community photo wall that guests can add to'],
}
const ACTIVITIES: Record<EventType, string[]> = {
  wedding: ['A short welcome toast with a memory-sharing moment', 'Guest message station instead of a formal guest book', 'Planned family portraits in the golden hour window', 'A late-evening dance floor with a final-song send-off'],
  birthday: ['A quick trivia game about the guest of honour', 'A memory jar where guests drop notes', 'A cake-cutting moment with a short toast', 'A small group game that mixes friend circles'],
  community: ['A 15-minute welcome and thank-you speech', 'A hands-on stall or workshop corner for families', 'A raffle or fundraising moment with clear rules', 'A volunteer recognition round at the end'],
}
const ENTERTAINMENT: Record<EventType, string[]> = {
  wedding: ['A live acoustic set during dinner, then a DJ for dancing', 'A playlist agreed with the couple, with a do-not-play list'],
  birthday: ['A DJ or curated playlist with age-appropriate music', 'A short surprise performance or video montage'],
  community: ['Local performers or an open-mic hour', 'Background music at low volume plus a speaker-ready sound setup'],
}
const FOOD: Record<EventType, string[]> = {
  wedding: ['A seated or buffet menu with clearly labelled dishes', 'A late-night snack counter for the dance floor', 'A signature non-alcoholic welcome drink'],
  birthday: ['A dessert-led spread with one centrepiece cake', 'Finger food that works while guests mingle', 'A themed drink station'],
  community: ['Refreshments that can be served quickly in a queue', 'Water points and a clearly labelled allergen list', 'Local food stalls or a shared potluck table'],
}

function recommendations(ctx: AiContext, alt = false): FullPlan['recommendations'] {
  const decor = [...DECOR[ctx.eventType]]
  const activities = [...ACTIVITIES[ctx.eventType]]
  const entertainment = [...ENTERTAINMENT[ctx.eventType]]
  const food = [...FOOD[ctx.eventType]]
  if (alt) {
    decor.reverse()
    activities.reverse()
    entertainment.reverse()
    food.reverse()
  }
  if (has(ctx, 'Vegetarian-friendly') || has(ctx, 'Vegan options') || has(ctx, 'Jain-friendly'))
    food.unshift('A fully vegetarian-friendly menu with clearly marked vegan and Jain-friendly dishes')
  if (has(ctx, 'Halal')) food.unshift('Halal-certified catering with separate preparation')
  if (has(ctx, 'Outdoor')) decor.unshift(`Outdoor-ready decor for ${ctx.location}: weighted fixtures and shade or covered areas`)
  if (has(ctx, 'Kids-friendly')) activities.unshift('A supervised kids’ corner with simple crafts and seating')
  if (has(ctx, 'Photo booth')) activities.unshift('A themed photo booth with props that match the colour palette')
  if (has(ctx, 'Live music')) entertainment.unshift('Live musicians with a clear set list and a sound check before guests arrive')
  if (has(ctx, 'DJ')) entertainment.unshift('A DJ with a lighting rig and a request list agreed in advance')
  if (has(ctx, 'Eco-friendly')) decor.push('Reusable or compostable tableware and potted plants instead of single-use items')
  return { decor: decor.slice(0, 6), activities: activities.slice(0, 6), entertainment: entertainment.slice(0, 6), food: food.slice(0, 6) }
}

function overview(ctx: AiContext, today: string): FullPlan['overview'] {
  const type = EVENT_TYPE_LABEL[ctx.eventType].toLowerCase()
  const days = daysBetween(today, ctx.date)
  const venue = { 'not-started': 'The venue is still to be found.', shortlisting: 'The venue is being shortlisted.', booked: 'The venue is already booked.', 'own-space': 'The event will use a space you already have.' }[ctx.venueStatus]
  const focus = ctx.priorities.length ? ` Priorities: ${ctx.priorities.join(', ').toLowerCase()}.` : ''
  return {
    concept: `${ctx.theme} ${type} for ${ctx.guestCount} guests in ${ctx.location} on ${formatDate(ctx.date)}, with ${days} day${days === 1 ? '' : 's'} to prepare. ${venue}${focus}`.slice(0, 700),
    themeName: ctx.theme,
    tagline: `A ${ctx.theme.toLowerCase()} ${type} that feels personal`.slice(0, 140),
    mood: [ctx.theme.split(' ')[0] ?? 'Warm', ctx.eventType === 'community' ? 'Welcoming' : 'Celebratory', has(ctx, 'Outdoor') ? 'Open-air' : 'Cosy'].slice(0, 6),
  }
}

const RATIONALE: Record<CategoryId, string> = {
  venue: 'Space and permissions shape every other decision, so it is funded first.',
  catering: 'Food is the biggest per-guest cost and the part guests remember.',
  decor: 'Sets the look of the theme; scale it to the space rather than the guest count.',
  photo: 'Captures the day; a smaller package is possible if budget is tight.',
  music: 'Sound and music set the energy; confirm equipment is included.',
  attire: 'Outfits and styling for the hosts or family.',
  stationery: 'Invitations and printed signage; digital invites cut this cost.',
  transport: 'Moving guests or equipment safely; group trips reduce cost.',
  favors: 'Small thank-you gifts; the first thing to trim if needed.',
  activities: 'Keeps guests engaged; low-cost options exist.',
  contingency: 'A reserve for price changes and last-minute needs.',
}

function budget(ctx: AiContext): FullPlan['budget'] {
  const reserve = Math.round(CONTINGENCY_MIN[ctx.flexibility] * 100)
  const base = SHARES[ctx.eventType].filter((s) => s.category !== 'contingency').map((s) => ({ ...s }))
  const boost = new Set(PRIORITY_OPTIONS.filter((o) => ctx.priorities.includes(o.id)).map((o) => o.category).filter(Boolean))
  let shares = base.map((s) => ({ ...s, pct: s.pct + (boost.has(s.category) ? 4 : 0) }))
  if (ctx.venueStatus === 'booked') shares = shares.map((s) => (s.category === 'venue' ? { ...s, pct: s.pct * 0.5 } : s))
  if (ctx.venueStatus === 'own-space') shares = shares.map((s) => (s.category === 'venue' ? { ...s, pct: s.pct * 0.2 } : s))
  if (ctx.priorities.includes('Keeping costs low') || ctx.flexibility === 'strict') shares = shares.filter((s) => s.category !== 'favors' && s.category !== 'attire' || ctx.eventType === 'wedding')
  const all = [...shares, { category: 'contingency' as CategoryId, pct: reserve }]
  const parts = allocateBudget(ctx.budget, all)
  const lines = parts.map((p) => ({
    category: p.category,
    title: CATEGORY_BY_ID[p.category].label,
    estimate: p.amount,
    rationale: RATIONALE[p.category],
    essential: p.category === 'venue' || p.category === 'catering' || p.category === 'contingency',
  }))
  const perGuest = Math.round(ctx.budget / ctx.guestCount)
  return {
    lines,
    savings: [
      { idea: 'Choose a weekday or off-peak slot for the venue and vendors', estimatedSaving: Math.round(ctx.budget * 0.05) },
      { idea: 'Send digital invitations and keep printing for signage only', estimatedSaving: Math.round(ctx.budget * 0.01) },
      ...(ctx.eventType === 'wedding' ? [{ idea: 'Seasonal, locally grown flowers instead of imported ones', estimatedSaving: Math.round(ctx.budget * 0.02) }] : []),
    ],
    upgrades: [
      `If there is room beyond ${perGuest.toLocaleString('en-US')} per guest, upgrade the line that matches your top priority first`,
      'A live musician for one segment instead of a playlist',
    ],
  }
}

const DEPENDS_ON_VENUE: CategoryId[] = ['catering', 'decor', 'photo', 'music', 'transport', 'activities']

function timeline(ctx: AiContext, today: string): TimelineItemAI[] {
  const runway = daysBetween(today, ctx.date)
  let templates = TASKS[ctx.eventType]
  if (runway <= 7) templates = templates.filter((t) => t.priority === 'high')
  else if (runway <= 21) templates = templates.filter((t) => t.priority !== 'low')
  const venueDone = ctx.venueStatus === 'booked' || ctx.venueStatus === 'own-space'
  const items: TimelineItemAI[] = templates.map((t, i) => {
    const isVenue = t.category === 'venue'
    return {
      id: `step-${i + 1}`,
      title: isVenue && venueDone ? 'Confirm venue contract, layout and access times' : t.title,
      description: `${t.title} for ${ctx.guestCount} guests in ${ctx.location}.`.slice(0, 280),
      daysBeforeEvent: isVenue && venueDone ? Math.min(t.daysBefore, 45) : t.daysBefore,
      priority: t.priority,
      dependsOn: [],
      category: t.category,
      bookingDeadline: ['venue', 'catering', 'photo', 'music'].includes(t.category ?? ''),
    }
  })
  const venue = items.find((i) => i.category === 'venue')
  const first = items[0]
  for (const it of items) {
    if (venue && it !== venue && it.category && DEPENDS_ON_VENUE.includes(it.category) && it.daysBeforeEvent <= venue.daysBeforeEvent) it.dependsOn = [venue.id]
    else if (first && it !== first && /invit/i.test(it.title)) it.dependsOn = [first.id]
  }
  const invites = items.find((i) => /formal invitations|Send invitations/i.test(i.title))
  const rsvp = items.find((i) => /RSVP|headcount/i.test(i.title))
  if (invites && rsvp && rsvp !== invites && rsvp.daysBeforeEvent <= invites.daysBeforeEvent) rsvp.dependsOn = [invites.id]
  return items
}

const VENDOR_COPY: Record<CategoryId, (c: AiContext) => { title: string; requirement: string; criteria: string[] }> = {
  venue: (c) => ({
    title: c.eventType === 'community' ? 'Venue and permissions' : 'Venue',
    requirement: `Space for ${c.guestCount} guests in or near ${c.location}${has(c, 'Outdoor') ? ' with a covered backup' : ''}${has(c, 'Accessible venue') || c.priorities.includes('Guest comfort & accessibility') ? ', step-free access' : ''}${c.eventType === 'community' ? ', plus any permits for public use and amplified sound' : ''}.`,
    criteria: [`Capacity of at least ${Math.round(c.guestCount * 1.1)} people`, 'What is included: furniture, power, cleaning', 'Cancellation and rescheduling terms'],
  }),
  catering: (c) => ({
    title: c.eventType === 'birthday' ? 'Cake and catering' : 'Catering',
    requirement: `Food for ${c.guestCount} guests${has(c, 'Vegetarian-friendly') ? ', vegetarian-friendly' : ''}${has(c, 'Halal') ? ', halal-certified' : ''}${has(c, 'Jain-friendly') ? ', Jain options' : ''}.`,
    criteria: ['Tasting before booking', 'Price per guest and minimum headcount', 'Allergen labelling and service staff included'],
  }),
  decor: (c) => ({
    title: c.eventType === 'community' ? 'Seating, signage and accessibility setup' : 'Decor and florals',
    requirement: `${c.theme} styling that works in ${has(c, 'Outdoor') ? 'an outdoor' : 'an indoor'} setting${c.eventType === 'community' ? ', with seating, wayfinding and accessible routes' : ''}.`,
    criteria: ['Portfolio with similar themes', 'Setup and teardown times', 'Itemised quote for each installation'],
  }),
  photo: (c) => ({ title: 'Photography and video', requirement: `Coverage for a ${c.eventType} of ${c.guestCount} guests, with a delivery timeline for edited photos.`, criteria: ['Portfolio of similar events', 'Hours of coverage and number of photographers', 'Delivery time and usage rights'] }),
  music: (c) => ({
    title: c.eventType === 'community' ? 'Sound equipment and performers' : 'Music and entertainment',
    requirement: `${has(c, 'Live music') ? 'Live music' : has(c, 'DJ') ? 'A DJ' : 'Music'} and sound system suited to ${c.guestCount} guests${c.eventType === 'community' ? ', with microphones for speakers' : ''}.`,
    criteria: ['Equipment list and power needs', 'Sound check time', 'Backup equipment if something fails'],
  }),
  attire: (c) => ({ title: 'Outfits and styling', requirement: `Outfits and fittings for the hosts or family, matched to the ${c.theme} palette.`, criteria: ['Fitting and alteration schedule', 'Return and rental terms'] }),
  stationery: (c) => ({ title: c.eventType === 'community' ? 'Posters and printing' : 'Invitations and stationery', requirement: `Invitations or posters for roughly ${c.guestCount} people, in ${c.theme} styling.`, criteria: ['Digital and printed options', 'Proof and turnaround time'] }),
  transport: (c) => ({ title: 'Transport', requirement: `Guest or equipment transport for ${c.guestCount} guests around ${c.location}.`, criteria: ['Vehicle capacity and licences', 'Pick-up schedule', 'Insurance cover'] }),
  favors: () => ({ title: 'Return gifts', requirement: 'Small thank-you gifts, personalised if possible.', criteria: ['Minimum order', 'Delivery date'] }),
  activities: (c) => ({
    title: c.eventType === 'community' ? 'Safety and activities' : 'Activities host',
    requirement: `${c.eventType === 'community' ? 'Stewards, first aid and crowd safety plan, plus ' : ''}activities that suit the age mix${has(c, 'Kids-friendly') ? ', including children' : ''}.`,
    criteria: ['Experience with similar events', 'Insurance and safety certificates', 'Staff-to-guest ratio'],
  }),
  contingency: () => ({ title: 'Contingency', requirement: 'Reserve fund.', criteria: ['n/a'] }),
}

function vendors(ctx: AiContext): VendorRequirementAI[] {
  const lead = (cat: CategoryId) => TASKS[ctx.eventType].find((t) => t.category === cat)?.daysBefore ?? 45
  const cats = VENDOR_CATEGORIES[ctx.eventType].filter((c) => c !== 'contingency' && !(c === 'venue' && (ctx.venueStatus === 'booked' || ctx.venueStatus === 'own-space')))
  return cats.map((category) => {
    const copy = VENDOR_COPY[category](ctx)
    const priority = category === 'venue' ? 'book-first' : category === 'catering' || category === 'photo' ? 'high' : category === 'favors' || category === 'stationery' ? 'low' : 'medium'
    return {
      category: category as Exclude<CategoryId, 'contingency'>,
      title: copy.title,
      requirement: copy.requirement.slice(0, 260),
      searchCriteria: copy.criteria.slice(0, 5),
      priority,
      bookByDaysBefore: lead(category),
    }
  })
}

function risks(ctx: AiContext, today: string): FullPlan['risks'] {
  const out: FullPlan['risks'] = []
  const runway = daysBetween(today, ctx.date)
  if (has(ctx, 'Outdoor'))
    out.push({ risk: 'Rain or extreme heat during an outdoor event', likelihood: 'medium', mitigation: 'Check the forecast one week out and hire a tent or shade early.', backupPlan: 'Hold a smaller indoor version in a pre-booked hall, with a decision deadline 48 hours before.' })
  out.push({ risk: 'A key vendor cancels or arrives late', likelihood: 'low', mitigation: 'Get written confirmations and a deposit receipt for each vendor.', backupPlan: 'Keep a second option for catering and sound with a verbal hold on the date.' })
  out.push({ risk: 'Headcount changes close to the date', likelihood: 'high', mitigation: 'Set an RSVP cut-off and order catering for the confirmed number plus a 5% buffer.', backupPlan: 'Agree a late-adjustment window with the caterer in writing.' })
  if (ctx.flexibility === 'strict')
    out.push({ risk: 'Costs creep above a strict budget', likelihood: 'medium', mitigation: 'Review spending weekly against the budget page and lock quotes early.', backupPlan: 'Cut optional lines first: favours, extra decor, premium upgrades.' })
  if (runway < 30)
    out.push({ risk: 'Short runway limits vendor availability', likelihood: 'high', mitigation: 'Contact venue and catering first today and accept a smaller shortlist.', backupPlan: 'Use a self-catered or simplified format if no caterer is free.' })
  if (ctx.eventType === 'community')
    out.push({ risk: 'Crowd safety or missing permissions', likelihood: 'medium', mitigation: 'Confirm permits and a stewarding plan with the venue or local authority.', backupPlan: 'Reduce the guest cap or split the event into two time slots.' })
  return out.slice(0, 8)
}

function assumptions(ctx: AiContext): { assumptions: string[]; followUps: string[] } {
  const perGuest = Math.round(ctx.budget / ctx.guestCount)
  const a = [
    `All amounts are planning estimates in ${ctx.currency}, not vendor quotations.`,
    `Budget treated as ${ctx.flexibility}: a reserve of ${Math.round(CONTINGENCY_MIN[ctx.flexibility] * 100)}% is kept for surprises.`,
    `Guest count of ${ctx.guestCount} is treated as final for costing; plus-ones are included.`,
  ]
  const q: string[] = []
  if (ctx.venueStatus === 'not-started' || ctx.venueStatus === 'shortlisting') q.push('Do you prefer an indoor or outdoor venue, and is there a hard cap on venue cost?')
  if (ctx.preferences.length === 0) q.push('Are there dietary, cultural or accessibility needs the plan should cover?')
  if (perGuest < 1500 && ctx.currency === 'INR') q.push('Your budget per guest is low for a catered event. Could the menu or guest list be simplified?')
  q.push('Which one or two parts of the event matter most to you? Those get the larger share.')
  return { assumptions: a, followUps: q.slice(0, 6) }
}

export function demoFullPlan(ctx: AiContext, today: string): FullPlan {
  const { assumptions: assume, followUps } = assumptions(ctx)
  return {
    overview: overview(ctx, today),
    recommendations: recommendations(ctx),
    budget: budget(ctx),
    timeline: timeline(ctx, today),
    vendors: vendors(ctx),
    risks: risks(ctx, today),
    assumptions: assume,
    followUpQuestions: followUps,
  }
}

export function demoSection(section: SectionKey | 'full', ctx: AiContext, today: string): Patch {
  const full = demoFullPlan(ctx, today)
  switch (section) {
    case 'full':
      return full
    case 'theme':
      return { overview: full.overview, recommendations: full.recommendations }
    case 'budget':
      return { budget: full.budget, assumptions: full.assumptions }
    case 'timeline':
      return { timeline: full.timeline, assumptions: full.assumptions }
    case 'vendors':
      return { vendors: full.vendors, assumptions: full.assumptions }
    case 'ideas':
      return { recommendations: recommendations(ctx, true) }
  }
}

/* ---------- Demo assistant: keyword rules, clearly not an AI model ---------- */

const num = (s: string) => Number(s.replace(/,/g, ''))
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14 }

export function demoAssistant(message: string, ctx: AiContext, current: CurrentSnapshot, today: string): AssistantReply {
  const m = message.toLowerCase()
  const known = [`${EVENT_TYPE_LABEL[ctx.eventType]} on ${formatDate(ctx.date)} in ${ctx.location}`, `${ctx.guestCount} guests, budget ${ctx.budget.toLocaleString('en-US')} ${ctx.currency}`]

  const planType = m.match(/plan an? (wedding|birthday|community)/)
  const planGuests = m.match(/(\d[\d,]*)\s*guests?/)
  const planBudget = m.match(/(?:within|under|budget(?: of)?)\D{0,6}(\d[\d,]*)/)
  if (planType && planGuests && planBudget) {
    const guests = num(planGuests[1]!)
    const budget = num(planBudget[1]!)
    const type = planType[1]
    return {
      reply: `I can set this event up for ${guests} guests with a budget of ${budget.toLocaleString('en-US')} ${ctx.currency}. Review the change below; nothing is applied until you confirm.${type !== ctx.eventType ? ` Note: this event is a ${ctx.eventType}, so the style will not switch to a ${type}. Create a new event for that.` : ''}`,
      known,
      assumptions: ['Costs were rebalanced proportionally across unlocked budget lines.'],
      clarifyingQuestions: ['Is the venue already fixed?'],
      proposal: { summary: `Set guests to ${guests} and budget to ${budget.toLocaleString('en-US')}`, eventChanges: { guestCount: guests, budget }, rebalanceBudget: true },
    }
  }

  const reduce = m.match(/(?:reduce|cut|lower|decrease)[^%\d]*?(\d+(?:\.\d+)?)\s*%/)
  if (reduce) {
    const pct = Number(reduce[1])
    return {
      reply: `Reducing the total budget by ${pct}%. Paid, billed and hand-edited lines stay as they are; the remaining lines are trimmed (optional ones first).`,
      known,
      assumptions: ['"Reduce my budget" means lowering the total you are willing to spend, not only trimming one category.'],
      clarifyingQuestions: [],
      proposal: { summary: `Lower the total budget by ${pct}% and rebalance`, eventChanges: { budgetPercentChange: -pct }, rebalanceBudget: true },
    }
  }

  const more = m.match(/(\d+)\s*(?:additional|more|extra)\s*guests?/)
  if (more) {
    const n = Number(more[1])
    return {
      reply: `Adding ${n} guests. Catering and favours scale with headcount; other lines stay put. Check whether the venue capacity and budget can take it.`,
      known,
      assumptions: ['Venue and decor costs do not change with the extra guests.'],
      clarifyingQuestions: ['Does the venue have room for the larger group?'],
      proposal: { summary: `Add ${n} guests and rescale per-guest costs`, eventChanges: { guestCountDelta: n }, rebalanceBudget: false },
    }
  }

  const left = m.match(/(?:only|just)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen)\s*days?\s*(?:left|remain|to go)/)
  if (left) {
    const d = WORD_NUM[left[1]!] ?? Number(left[1])
    const open = current.tasks.filter((t) => !t.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5)
    return {
      reply: `With about ${d} days left, focus on: 1) lock venue and catering, 2) confirm headcount, 3) confirm photographer and sound, 4) arrange day-of logistics, 5) prepare a backup. ${open.length ? `Your next open tasks are: ${open.map((t) => t.title).join('; ')}.` : ''}`.slice(0, 1400),
      known,
      assumptions: [`The event date in your plan is ${formatDate(ctx.date)}, which is ${daysBetween(today, ctx.date)} days from today.`],
      clarifyingQuestions: [],
      proposal: { summary: 'Replace open tasks with a compressed priority schedule', patch: { timeline: demoSection('timeline', { ...ctx, date: ctx.date }, today).timeline } },
    }
  }

  if (/backup|indoor|rain|weather/.test(m))
    return {
      reply: 'Here is an indoor backup: pre-book a hall with a verbal hold, set a go/no-go time 48 hours before, and keep decor modular so it moves in one trip.',
      known,
      assumptions: ['The main plan is outdoors or weather-dependent.'],
      clarifyingQuestions: ctx.venueStatus === 'booked' ? [] : ['Which indoor options are within reach of your venue?'],
      proposal: {
        summary: 'Add an indoor backup plan to the risks list',
        patch: { risks: [{ risk: 'Weather forces the event indoors', likelihood: 'medium', mitigation: 'Hold a verbal booking on an indoor hall and agree a decision time 48 hours before.', backupPlan: 'Move to the indoor hall with a reduced layout; prioritise seating, food and sound.' }] },
      },
    }

  if (/vegetarian|vegan|menu/.test(m))
    return {
      reply: 'A vegetarian-friendly menu: a welcome drink, two starters, three mains with a protein-rich option, a dal or lentil dish, breads and rice, two desserts. Label vegan and Jain-friendly dishes and check for nuts.',
      known,
      assumptions: ['No guests require strictly vegan-only service unless you tell me.'],
      clarifyingQuestions: ['Are there guests with allergies I should plan around?'],
      proposal: {
        summary: 'Update food ideas with a vegetarian-friendly menu',
        patch: { recommendations: { ...recommendations({ ...ctx, preferences: [...new Set([...ctx.preferences, 'Vegetarian-friendly'])] }), } },
      },
    }

  const expense = current.expenses.find((e) => m.includes(e.title.toLowerCase().split(' ')[0] ?? '') || m.includes(e.category))
  if (/why|explain|necessary/.test(m)) {
    if (expense)
      return {
        reply: `"${expense.title}" (${expense.category}) is in the plan because ${RATIONALE[expense.category].toLowerCase()} It is currently estimated at ${expense.estimated.toLocaleString('en-US')} ${ctx.currency}${expense.billed !== null ? ` and billed at ${expense.billed.toLocaleString('en-US')}` : ''}. That is an estimate, not a quotation.`,
        known, assumptions: [], clarifyingQuestions: [],
      }
    return { reply: 'Tell me which expense or category you want explained, for example "Explain why the venue line is necessary".', known, assumptions: [], clarifyingQuestions: ['Which expense should I explain?'] }
  }

  return {
    reply: 'I am the demo assistant, which only understands a few request types (no live AI is connected). Try: "Reduce my budget by 15%", "Adjust the plan for 50 additional guests", "I have only seven days left", "Suggest an indoor backup plan", "Create a vegetarian-friendly menu" or "Explain why the venue is necessary".',
    known,
    assumptions: [],
    clarifyingQuestions: ['What would you like to change: budget, guests, timeline, vendors or ideas?'],
  }
}
