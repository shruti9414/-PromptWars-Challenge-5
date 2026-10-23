import { z } from 'zod'
import { isValidISODate } from '../lib/dates'

/* ---------- Shared enums ---------- */

export const CATEGORY_IDS = [
  'venue', 'catering', 'decor', 'photo', 'music', 'attire', 'stationery', 'transport', 'favors', 'activities', 'contingency',
] as const
export const VENDOR_CATEGORY_IDS = CATEGORY_IDS.filter((c) => c !== 'contingency') as unknown as readonly [
  Exclude<(typeof CATEGORY_IDS)[number], 'contingency'>,
  ...Exclude<(typeof CATEGORY_IDS)[number], 'contingency'>[],
]
export const VENUE_STATUSES = ['not-started', 'shortlisting', 'booked', 'own-space'] as const
export const FLEXIBILITY = ['strict', 'moderate', 'flexible'] as const
export const SECTIONS = ['theme', 'budget', 'timeline', 'vendors', 'ideas'] as const

const text = (max: number) => z.string().trim().min(1).max(max)
const isoDate = z.string().refine(isValidISODate, 'Expected a real yyyy-mm-dd date')
const money = z.number().finite().min(0).max(1_000_000_000)

/* ---------- What the browser may send (event context) ---------- */

/**
 * The only event details that ever leave the browser. Deliberately excludes the event name,
 * free-form notes, guest names and any vendor contact details.
 */
export const AiContextSchema = z.strictObject({
  eventType: z.enum(['wedding', 'birthday', 'anniversary', 'community']),
  date: isoDate,
  location: text(100),
  guestCount: z.number().int().min(1).max(5000),
  budget: z.number().int().min(1000).max(1_000_000_000),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  theme: text(60),
  preferences: z.array(text(40)).max(14),
  venueStatus: z.enum(VENUE_STATUSES),
  priorities: z.array(text(40)).max(8),
  flexibility: z.enum(FLEXIBILITY),
  instructions: z.string().trim().max(400).optional(),
})
export type AiContext = z.infer<typeof AiContextSchema>

/** Compact summary of what already exists, so regenerated sections respect current decisions. */
export const CurrentSnapshotSchema = z.strictObject({
  expenses: z.array(z.strictObject({ title: text(80), category: z.enum(CATEGORY_IDS), estimated: money, billed: money.nullable(), locked: z.boolean() })).max(30),
  tasks: z.array(z.strictObject({ title: text(100), dueDate: isoDate, done: z.boolean(), locked: z.boolean() })).max(40),
  vendors: z.array(z.strictObject({ title: text(80), category: z.enum(CATEGORY_IDS), status: text(20), locked: z.boolean() })).max(20),
})
export type CurrentSnapshot = z.infer<typeof CurrentSnapshotSchema>

/* ---------- What the model returns ---------- */

export const OverviewSchema = z.strictObject({
  concept: text(700),
  themeName: text(60),
  tagline: text(140),
  mood: z.array(text(30)).min(1).max(6),
})

export const RecommendationsSchema = z.strictObject({
  decor: z.array(text(240)).min(1).max(6),
  activities: z.array(text(240)).min(1).max(6),
  entertainment: z.array(text(240)).min(1).max(6),
  food: z.array(text(240)).min(1).max(6),
})

export const BudgetLineSchema = z.strictObject({
  category: z.enum(CATEGORY_IDS),
  title: text(80),
  estimate: money,
  rationale: text(260),
  essential: z.boolean(),
})
export type BudgetLineAI = z.infer<typeof BudgetLineSchema>

export const BudgetSectionSchema = z.strictObject({
  lines: z.array(BudgetLineSchema).min(3).max(14),
  savings: z.array(z.strictObject({ idea: text(220), estimatedSaving: money })).max(6),
  upgrades: z.array(text(220)).max(5),
})

export const TimelineItemSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,24}$/, 'id must be short lowercase kebab-case'),
  title: text(100),
  description: text(280),
  daysBeforeEvent: z.number().int().min(0).max(730),
  priority: z.enum(['low', 'medium', 'high']),
  dependsOn: z.array(z.string()).max(4),
  category: z.enum(CATEGORY_IDS).optional(),
  bookingDeadline: z.boolean(),
})
export type TimelineItemAI = z.infer<typeof TimelineItemSchema>

export const VendorRequirementSchema = z.strictObject({
  category: z.enum(VENDOR_CATEGORY_IDS),
  title: text(80),
  requirement: text(260),
  searchCriteria: z.array(text(140)).min(1).max(5),
  priority: z.enum(['book-first', 'high', 'medium', 'low']),
  bookByDaysBefore: z.number().int().min(0).max(730),
})
export type VendorRequirementAI = z.infer<typeof VendorRequirementSchema>

export const RiskSchema = z.strictObject({
  risk: text(180),
  likelihood: z.enum(['low', 'medium', 'high']),
  mitigation: text(260),
  backupPlan: text(260),
})

const notes = z.array(text(220)).max(8)

export const FullPlanSchema = z.strictObject({
  overview: OverviewSchema,
  recommendations: RecommendationsSchema,
  budget: BudgetSectionSchema,
  timeline: z.array(TimelineItemSchema).min(4).max(24),
  vendors: z.array(VendorRequirementSchema).min(3).max(14),
  risks: z.array(RiskSchema).min(1).max(8),
  assumptions: notes,
  followUpQuestions: z.array(text(220)).max(6),
})
export type FullPlan = z.infer<typeof FullPlanSchema>

/** Per-section outputs for regeneration. */
export const SECTION_SCHEMAS = {
  theme: z.strictObject({ overview: OverviewSchema, recommendations: RecommendationsSchema }),
  budget: z.strictObject({ budget: BudgetSectionSchema, assumptions: notes }),
  timeline: z.strictObject({ timeline: z.array(TimelineItemSchema).min(4).max(24), assumptions: notes }),
  vendors: z.strictObject({ vendors: z.array(VendorRequirementSchema).min(3).max(14), assumptions: notes }),
  ideas: z.strictObject({ recommendations: RecommendationsSchema }),
} as const
export type SectionKey = keyof typeof SECTION_SCHEMAS

/** What a section/assistant response is reduced to before the app turns it into a reviewable proposal. */
export const PatchSchema = z.strictObject({
  overview: OverviewSchema.optional(),
  recommendations: RecommendationsSchema.optional(),
  budget: BudgetSectionSchema.optional(),
  timeline: z.array(TimelineItemSchema).max(24).optional(),
  vendors: z.array(VendorRequirementSchema).max(14).optional(),
  risks: z.array(RiskSchema).max(8).optional(),
  assumptions: notes.optional(),
  followUpQuestions: z.array(text(220)).max(6).optional(),
})
export type Patch = z.infer<typeof PatchSchema>

/** Changes to the event itself. Percentages and deltas are applied by application code, never by the model. */
export const EventChangesSchema = z.strictObject({
  guestCountDelta: z.number().int().min(-5000).max(5000).optional(),
  guestCount: z.number().int().min(1).max(5000).optional(),
  budgetPercentChange: z.number().finite().min(-90).max(300).optional(),
  budget: z.number().int().min(1000).max(1_000_000_000).optional(),
})
export type EventChanges = z.infer<typeof EventChangesSchema>

export const AssistantReplySchema = z.strictObject({
  reply: text(1400),
  known: z.array(text(200)).max(6),
  assumptions: z.array(text(200)).max(6),
  clarifyingQuestions: z.array(text(200)).max(3),
  proposal: z
    .strictObject({
      summary: text(240),
      eventChanges: EventChangesSchema.optional(),
      rebalanceBudget: z.boolean().optional(),
      patch: PatchSchema.optional(),
    })
    .optional(),
})
export type AssistantReply = z.infer<typeof AssistantReplySchema>

/* ---------- API request / response envelopes ---------- */

export const PlanRequestSchema = z.strictObject({
  context: AiContextSchema,
  section: z.enum(['full', ...SECTIONS]),
  current: CurrentSnapshotSchema.optional(),
})
export type PlanRequest = z.infer<typeof PlanRequestSchema>

export const AssistantRequestSchema = z.strictObject({
  context: AiContextSchema,
  current: CurrentSnapshotSchema,
  message: z.string().trim().min(1).max(600),
  history: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().max(600) })).max(6),
})
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>

export const SourceSchema = z.enum(['live', 'demo'])
export type Source = z.infer<typeof SourceSchema>

export const PlanResponseSchema = z.strictObject({
  source: SourceSchema,
  model: z.string().max(80).optional(),
  patch: PatchSchema,
})
export type PlanResponse = z.infer<typeof PlanResponseSchema>

export const AssistantResponseSchema = z.strictObject({
  source: SourceSchema,
  model: z.string().max(80).optional(),
  reply: AssistantReplySchema,
})
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>

export const StatusResponseSchema = z.strictObject({ live: z.boolean(), model: z.string().max(80).optional() })

export const ERROR_KINDS = ['invalid_request', 'payload_too_large', 'rate_limited', 'timeout', 'provider_error', 'invalid_output', 'method_not_allowed'] as const
export type ErrorKind = (typeof ERROR_KINDS)[number]
export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({ kind: z.enum(ERROR_KINDS), message: z.string().max(400), retryAfter: z.number().optional() }),
})

/* ---------- What gets persisted on an event ---------- */

export const StoredAiPlanSchema = z.strictObject({
  source: SourceSchema,
  model: z.string().max(80).optional(),
  generatedAt: z.string().max(40),
  flexibility: z.enum(FLEXIBILITY),
  overview: OverviewSchema.optional(),
  recommendations: RecommendationsSchema.optional(),
  risks: z.array(RiskSchema).max(8).optional(),
  assumptions: notes.optional(),
  followUpQuestions: z.array(text(220)).max(6).optional(),
  savings: z.array(z.strictObject({ idea: text(220), estimatedSaving: money })).max(6).optional(),
  upgrades: z.array(text(220)).max(5).optional(),
  issues: z.array(z.string().max(300)).max(20).optional(),
})
export type StoredAiPlan = z.infer<typeof StoredAiPlanSchema>

const ExpenseSnap = z.object({
  id: z.string(), title: z.string(), category: z.enum(CATEGORY_IDS), estimated: z.number(), actual: z.number().nullable(), paid: z.boolean(), manual: z.boolean().optional(),
})
const TaskSnap = z.object({
  id: z.string(), title: z.string(), dueDate: z.string().refine(isValidISODate), priority: z.enum(['low', 'medium', 'high']), done: z.boolean(),
  category: z.enum(CATEGORY_IDS).optional(), description: z.string().optional(), dependsOn: z.array(z.string()).optional(),
  bookingDeadline: z.boolean().optional(), order: z.number().optional(), manual: z.boolean().optional(),
})
const VendorSnap = z.object({
  id: z.string(), category: z.enum(CATEGORY_IDS), name: z.string(), status: z.string(), quote: z.number().nullable(), notes: z.string(),
  directoryId: z.string().optional(), requirement: z.string().optional(), criteria: z.array(z.string()).optional(),
  bookBy: z.string().optional(), priority: z.string().optional(), manual: z.boolean().optional(),
})

export const PlanRevisionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  label: z.string().max(200),
  source: SourceSchema,
  snapshot: z.object({
    guestCount: z.number(),
    budget: z.number(),
    expenses: z.array(ExpenseSnap),
    tasks: z.array(TaskSnap),
    vendors: z.array(VendorSnap),
    aiPlan: StoredAiPlanSchema.optional(),
  }),
})
export type PlanRevision = z.infer<typeof PlanRevisionSchema>

/** JSON Schema for a forced tool call. `$schema` is dropped because the provider does not need it. */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>
  delete json.$schema
  return json
}
