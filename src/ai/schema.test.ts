import { describe, expect, it } from 'vitest'
import { demoFullPlan, demoSection } from './demo'
import {
  AiContextSchema,
  AssistantReplySchema,
  FullPlanSchema,
  PatchSchema,
  PlanRequestSchema,
  SECTION_SCHEMAS,
  StoredAiPlanSchema,
  TimelineItemSchema,
  VendorRequirementSchema,
  toToolSchema,
} from './schema'
import type { AiContext } from './schema'

const TODAY = '2026-10-23'
const ctx = (over: Partial<AiContext> = {}): AiContext => ({
  eventType: 'wedding', date: '2027-02-14', location: 'Udaipur', guestCount: 150, budget: 2_500_000, currency: 'INR',
  theme: 'Midnight Garden', preferences: ['Outdoor', 'Vegetarian-friendly'], venueStatus: 'shortlisting',
  priorities: ['Food & catering'], flexibility: 'moderate', ...over,
})

describe('AiContextSchema (what may leave the browser)', () => {
  it('accepts a normal context', () => {
    expect(AiContextSchema.safeParse(ctx()).success).toBe(true)
  })
  it('rejects extra fields so names, notes or guest lists cannot be smuggled in', () => {
    expect(AiContextSchema.safeParse({ ...ctx(), name: 'Aarav & Meera' }).success).toBe(false)
    expect(AiContextSchema.safeParse({ ...ctx(), guests: ['A', 'B'] }).success).toBe(false)
  })
  it.each([
    ['unknown event type', { eventType: 'funeral' }],
    ['impossible date', { date: '2027-02-31' }],
    ['zero guests', { guestCount: 0 }],
    ['fractional guests', { guestCount: 10.5 }],
    ['tiny budget', { budget: 10 }],
    ['negative budget', { budget: -5 }],
    ['unknown currency', { currency: 'BTC' }],
    ['blank location', { location: '   ' }],
    ['long instructions', { instructions: 'x'.repeat(401) }],
    ['bad flexibility', { flexibility: 'wild' }],
    ['bad venue status', { venueStatus: 'maybe' }],
  ])('rejects %s', (_, over) => {
    expect(AiContextSchema.safeParse(ctx(over as Partial<AiContext>)).success).toBe(false)
  })
})

describe('model output schemas', () => {
  const good = () => structuredClone(demoFullPlan(ctx(), TODAY))

  it('accepts a well-formed full plan', () => {
    expect(FullPlanSchema.safeParse(good()).success).toBe(true)
  })

  it('rejects a plan missing a section or carrying unknown keys', () => {
    const { risks: _risks, ...missing } = good()
    expect(FullPlanSchema.safeParse(missing).success).toBe(false)
    expect(FullPlanSchema.safeParse({ ...good(), extra: 'x' }).success).toBe(false)
  })

  it('rejects invalid numbers in budget lines', () => {
    for (const estimate of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2_000_000_000, '5000' as never]) {
      const plan = good()
      plan.budget.lines[0]!.estimate = estimate
      expect(FullPlanSchema.safeParse(plan).success, String(estimate)).toBe(false)
    }
  })

  it('rejects bad timeline items', () => {
    const item = good().timeline[0]!
    expect(TimelineItemSchema.safeParse({ ...item, daysBeforeEvent: -1 }).success).toBe(false)
    expect(TimelineItemSchema.safeParse({ ...item, daysBeforeEvent: 1.5 }).success).toBe(false)
    expect(TimelineItemSchema.safeParse({ ...item, daysBeforeEvent: 9999 }).success).toBe(false)
    expect(TimelineItemSchema.safeParse({ ...item, id: 'Not Valid!' }).success).toBe(false)
    expect(TimelineItemSchema.safeParse({ ...item, priority: 'urgent' }).success).toBe(false)
  })

  it('rejects vendors that are not categories we support', () => {
    const v = good().vendors[0]!
    expect(VendorRequirementSchema.safeParse({ ...v, category: 'contingency' }).success).toBe(false)
    expect(VendorRequirementSchema.safeParse({ ...v, searchCriteria: [] }).success).toBe(false)
  })

  it('requires a minimum amount of content in a full plan', () => {
    const plan = good()
    plan.timeline = plan.timeline.slice(0, 2)
    expect(FullPlanSchema.safeParse(plan).success).toBe(false)
  })

  it('validates assistant replies and optional proposals', () => {
    const ok = { reply: 'Done', known: [], assumptions: [], clarifyingQuestions: [], proposal: { summary: 'Cut 15%', eventChanges: { budgetPercentChange: -15 }, rebalanceBudget: true } }
    expect(AssistantReplySchema.safeParse(ok).success).toBe(true)
    expect(AssistantReplySchema.safeParse({ ...ok, proposal: { summary: 'x', eventChanges: { budgetPercentChange: -500 } } }).success).toBe(false)
    expect(AssistantReplySchema.safeParse({ ...ok, reply: '' }).success).toBe(false)
    expect(AssistantReplySchema.safeParse({ ...ok, clarifyingQuestions: ['a', 'b', 'c', 'd'] }).success).toBe(false)
  })

  it('validates requests, including payload shape', () => {
    expect(PlanRequestSchema.safeParse({ context: ctx(), section: 'budget' }).success).toBe(true)
    expect(PlanRequestSchema.safeParse({ context: ctx(), section: 'everything' }).success).toBe(false)
    expect(PlanRequestSchema.safeParse({ section: 'full' }).success).toBe(false)
  })

  it('validates what is persisted on an event', () => {
    expect(StoredAiPlanSchema.safeParse({ source: 'demo', generatedAt: '2026-10-23T10:00:00Z', flexibility: 'strict' }).success).toBe(true)
    expect(StoredAiPlanSchema.safeParse({ source: 'robot', generatedAt: 'x', flexibility: 'strict' }).success).toBe(false)
  })

  it('produces a JSON schema for the provider tool without the $schema key', () => {
    const json = toToolSchema(FullPlanSchema)
    expect(json.type).toBe('object')
    expect(json).not.toHaveProperty('$schema')
    expect(Object.keys(json.properties as object)).toEqual(expect.arrayContaining(['overview', 'budget', 'timeline', 'vendors', 'risks']))
  })
})

describe('demo planner output', () => {
  it.each(['wedding', 'birthday', 'community'] as const)('%s plans satisfy the schema for several dates, budgets and styles', (eventType) => {
    for (const date of ['2026-10-24', '2026-11-05', '2027-01-15', '2028-03-01'])
      for (const flexibility of ['strict', 'moderate', 'flexible'] as const)
        for (const venueStatus of ['not-started', 'booked', 'own-space'] as const) {
          const c = ctx({ eventType, date, flexibility, venueStatus, guestCount: 40, budget: 150_000 })
          expect(FullPlanSchema.safeParse(demoFullPlan(c, TODAY)).success, `${eventType} ${date} ${flexibility} ${venueStatus}`).toBe(true)
        }
  })

  it('section outputs validate against their own section schemas', () => {
    for (const section of Object.keys(SECTION_SCHEMAS) as (keyof typeof SECTION_SCHEMAS)[]) {
      const patch = demoSection(section, ctx(), TODAY)
      expect(SECTION_SCHEMAS[section].safeParse(patch).success, section).toBe(true)
      expect(PatchSchema.safeParse(patch).success).toBe(true)
    }
  })

  it('is tailored: output differs by event type, theme, preferences and priorities', () => {
    const a = demoFullPlan(ctx(), TODAY)
    const b = demoFullPlan(ctx({ eventType: 'birthday', theme: 'Neon Night', preferences: ['DJ', 'Kids-friendly'], priorities: ['Music & entertainment'], guestCount: 30, budget: 100_000 }), TODAY)
    expect(a.overview.concept).not.toBe(b.overview.concept)
    expect(a.overview.concept).toContain('Midnight Garden')
    expect(b.overview.concept).toContain('Neon Night')
    expect(JSON.stringify(a.recommendations)).not.toBe(JSON.stringify(b.recommendations))
    expect(a.vendors.map((v) => v.category)).not.toEqual(b.vendors.map((v) => v.category))
    const music = (p: typeof a) => p.budget.lines.find((l) => l.category === 'music')!.estimate / p.budget.lines.reduce((s, l) => s + l.estimate, 0)
    const noPriority = demoFullPlan(ctx({ eventType: 'birthday', priorities: [], guestCount: 30, budget: 100_000 }), TODAY)
    expect(music(b)).toBeGreaterThan(music(noPriority))
  })

  it('adapts to preferences: vegetarian menu, outdoor backup and a venue that is already booked', () => {
    const plan = demoFullPlan(ctx({ venueStatus: 'booked' }), TODAY)
    expect(plan.recommendations.food[0]).toMatch(/vegetarian/i)
    expect(plan.risks.some((r) => /rain|heat/i.test(r.risk))).toBe(true)
    expect(plan.vendors.some((v) => v.category === 'venue')).toBe(false)
    const venue = (p: typeof plan) => p.budget.lines.find((l) => l.category === 'venue')!.estimate
    expect(venue(plan)).toBeLessThan(venue(demoFullPlan(ctx({ venueStatus: 'not-started' }), TODAY)))
  })

  it('compresses the timeline when the event is close', () => {
    const near = demoFullPlan(ctx({ date: '2026-10-30' }), TODAY)
    const far = demoFullPlan(ctx({ date: '2027-06-01' }), TODAY)
    expect(near.timeline.length).toBeLessThan(far.timeline.length)
    expect(near.timeline.every((t) => t.priority === 'high')).toBe(true)
  })
})
