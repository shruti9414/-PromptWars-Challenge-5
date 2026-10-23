import { addDays, daysBetween, formatDate } from '../lib/dates'
import { newId } from '../lib/format'
import type { Task, VendorBooking } from '../types'
import { isProtectedTask, isProtectedVendor } from './context'
import type { TimelineItemAI, VendorRequirementAI } from './schema'

export interface TimelineResult {
  tasks: Task[]
  issues: string[]
  /** Days between today and the event; negative when the event date has passed. */
  runway: number
  compressed: boolean
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

/** Depth-first search for a dependency cycle; returns the first edge (from -> to) that closes one. */
function findCycleEdge(deps: Map<string, string[]>): [string, string] | null {
  const state = new Map<string, 1 | 2>()
  let found: [string, string] | null = null
  const visit = (id: string) => {
    state.set(id, 1)
    for (const d of deps.get(id) ?? []) {
      if (found) return
      if (state.get(d) === 1) {
        found = [id, d]
        return
      }
      if (!state.has(d)) visit(d)
    }
    state.set(id, 2)
  }
  for (const id of deps.keys()) if (!state.has(id) && !found) visit(id)
  return found
}

/**
 * Turns model timeline items into dated tasks, deterministically:
 *  - ids are made unique, unknown / self / circular dependencies are removed
 *  - due dates are computed from the real event date (the model only supplies "days before")
 *  - if deadlines would already be in the past, the whole plan is compressed proportionally
 *  - a task never comes due after something that depends on it
 *  - a last-minute checklist task is added when the model did not provide one
 * Everything the app changed is reported in `issues`.
 */
export function normalizeTimeline(items: TimelineItemAI[], eventDate: string, today: string): TimelineResult {
  const issues: string[] = []
  const runway = daysBetween(today, eventDate)
  if (runway < 0) {
    return { tasks: [], issues: [`The event date (${formatDate(eventDate)}) has already passed, so no preparation timeline can be built.`], runway, compressed: false }
  }

  // Unique ids
  const seen = new Set<string>()
  const list = items.map((it) => {
    let id = it.id
    if (seen.has(id)) {
      const fresh = `${id}-${seen.size + 1}`
      issues.push(`Two tasks shared the id "${id}"; one was renamed.`)
      id = fresh
    }
    seen.add(id)
    return { ...it, id, dependsOn: [...it.dependsOn] }
  })

  // Dependencies
  const ids = new Set(list.map((l) => l.id))
  for (const l of list) {
    l.dependsOn = [...new Set(l.dependsOn)].filter((d) => {
      if (d === l.id) {
        issues.push(`"${l.title}" listed itself as a dependency; removed.`)
        return false
      }
      if (!ids.has(d)) {
        issues.push(`"${l.title}" depended on an unknown task ("${d}"); removed.`)
        return false
      }
      return true
    })
  }
  const depMap = new Map(list.map((l) => [l.id, l.dependsOn]))
  for (let guard = 0; guard < 50; guard++) {
    const edge = findCycleEdge(depMap)
    if (!edge) break
    const [from, to] = edge
    depMap.set(from, (depMap.get(from) ?? []).filter((d) => d !== to))
    const title = list.find((l) => l.id === from)?.title ?? from
    issues.push(`A circular dependency involving "${title}" was removed.`)
  }
  for (const l of list) l.dependsOn = depMap.get(l.id) ?? []

  // Dates, compressing when the template does not fit the time available
  const longest = Math.max(...list.map((l) => l.daysBeforeEvent), 0)
  const compressed = longest > runway
  if (compressed)
    issues.push(
      runway === 0
        ? 'The event is today, so every task is due today.'
        : `Only ${runway} day${runway === 1 ? '' : 's'} remain, but the plan needed up to ${longest}. Deadlines were compressed proportionally; review the tightest ones first.`,
    )
  const before = new Map<string, number>(
    list.map((l) => [l.id, compressed ? Math.min(runway, Math.round((l.daysBeforeEvent * runway) / Math.max(longest, 1))) : l.daysBeforeEvent]),
  )

  // A dependency can never be due after the task that needs it.
  const dependents = (id: string) => list.filter((l) => l.dependsOn.includes(id))
  const topo: string[] = []
  const done = new Set<string>()
  const place = (id: string) => {
    if (done.has(id)) return
    done.add(id)
    for (const d of depMap.get(id) ?? []) place(d)
    topo.push(id)
  }
  list.forEach((l) => place(l.id))
  for (const id of [...topo].reverse()) {
    for (const parent of dependents(id)) {
      // `before` is days before the event: a dependency needs at least as many days of lead time as its dependent.
      if ((before.get(id) ?? 0) < (before.get(parent.id) ?? 0)) {
        before.set(id, before.get(parent.id) ?? 0)
        issues.push(`"${list.find((l) => l.id === id)?.title}" was moved earlier because "${parent.title}" depends on it.`)
      }
    }
  }

  // Build tasks, then add a last-minute task if needed.
  const realIds = new Map(list.map((l) => [l.id, newId()]))
  const built = list.map((l) => ({
    key: l.id,
    task: {
      id: realIds.get(l.id)!,
      title: l.title,
      description: l.description,
      dueDate: addDays(eventDate, -(before.get(l.id) ?? 0)),
      priority: l.priority,
      done: false,
      category: l.category,
      dependsOn: l.dependsOn.map((d) => realIds.get(d)!),
      bookingDeadline: l.bookingDeadline,
    } as Task,
  }))
  if (!built.some((b) => daysBetween(b.task.dueDate, eventDate) <= 2)) {
    const lastDay = addDays(eventDate, runway >= 1 ? -1 : 0)
    built.push({
      key: 'last-minute',
      task: {
        id: newId(),
        title: 'Final walkthrough and day-of checklist',
        description: 'Confirm arrival times with every vendor, check the headcount, pack essentials and brief helpers.',
        dueDate: lastDay,
        priority: 'high',
        done: false,
        dependsOn: [],
        bookingDeadline: false,
      } as Task,
    })
    issues.push('Added a last-minute walkthrough task because the plan had none close to the event.')
  }

  // Suggested completion order: by date, then dependency depth, then priority.
  const depth = (id: string, seenIds = new Set<string>()): number => {
    if (seenIds.has(id)) return 0
    seenIds.add(id)
    return 1 + Math.max(0, ...(depMap.get(id) ?? []).map((d) => depth(d, seenIds)))
  }
  built.sort(
    (a, b) =>
      a.task.dueDate.localeCompare(b.task.dueDate) ||
      depth(b.key) - depth(a.key) ||
      PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority],
  )
  const tasks = built.map((b, i) => ({ ...b.task, order: i + 1 }))
  return { tasks, issues, runway, compressed }
}

export interface TimelineMerge {
  tasks: Task[]
  kept: number
  replaced: number
  issues: string[]
}

/** Keeps finished or hand-edited tasks, replaces the rest with the generated ones. */
export function mergeTimeline(existing: Task[], generated: Task[]): TimelineMerge {
  const kept = existing.filter(isProtectedTask)
  const replaced = existing.length - kept.length
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const keptTitles = new Set(kept.map((t) => norm(t.title)))
  const issues: string[] = []
  const fresh = generated.filter((t) => {
    if (keptTitles.has(norm(t.title))) {
      issues.push(`Skipped "${t.title}" because you already have it.`)
      return false
    }
    return true
  })
  // Dependencies on tasks that were skipped are dropped.
  const freshIds = new Set(fresh.map((t) => t.id))
  const cleaned = fresh.map((t) => ({ ...t, dependsOn: t.dependsOn?.filter((d) => freshIds.has(d)) }))
  return { tasks: [...kept, ...cleaned], kept: kept.length, replaced, issues }
}

export interface VendorResult { vendors: VendorBooking[]; issues: string[] }

/** Converts generated vendor requirements into checklist entries with real booking deadlines. */
export function normalizeVendors(items: VendorRequirementAI[], eventDate: string, today: string): VendorResult {
  const issues: string[] = []
  const runway = daysBetween(today, eventDate)
  const longest = Math.max(...items.map((i) => i.bookByDaysBefore), 0)
  const vendors = items.map((v) => {
    let days = v.bookByDaysBefore
    if (runway >= 0 && longest > runway) days = Math.min(runway, Math.round((days * runway) / Math.max(longest, 1)))
    let bookBy = addDays(eventDate, -days)
    if (bookBy < today) {
      bookBy = today
      issues.push(`${v.title} should already be booked. Contact options today.`)
    }
    return {
      id: newId(),
      category: v.category,
      name: v.title,
      status: 'to-research' as const,
      quote: null,
      notes: '',
      requirement: v.requirement,
      criteria: v.searchCriteria,
      bookBy,
      priority: v.priority,
    } as VendorBooking
  })
  const order = { 'book-first': 0, high: 1, medium: 2, low: 3 } as const
  vendors.sort((a, b) => order[a.priority ?? 'low'] - order[b.priority ?? 'low'] || (a.bookBy ?? '').localeCompare(b.bookBy ?? ''))
  return { vendors, issues }
}

export interface VendorMerge { vendors: VendorBooking[]; kept: number; replaced: number; issues: string[] }

/** Keeps vendors the user is already working with; replaces untouched "needed" entries. */
export function mergeVendors(existing: VendorBooking[], generated: VendorBooking[]): VendorMerge {
  const kept = existing.filter(isProtectedVendor)
  const issues: string[] = []
  const coveredCategories = new Set(kept.map((v) => v.category))
  const fresh = generated.filter((v) => {
    if (coveredCategories.has(v.category)) {
      issues.push(`Skipped ${v.name}: you already have a ${v.category} entry in progress.`)
      return false
    }
    return true
  })
  return { vendors: [...kept, ...fresh], kept: kept.length, replaced: existing.length - kept.length, issues }
}
