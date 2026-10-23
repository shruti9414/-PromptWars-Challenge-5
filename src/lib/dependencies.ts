import type { Task } from '../types'

/** True when making `taskId` depend on `deps` would create a loop (A needs B needs ... needs A). */
export function wouldCreateCycle(tasks: Task[], taskId: string, deps: string[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const stack = [...deps]
  while (stack.length) {
    const id = stack.pop() as string
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of byId.get(id)?.dependsOn ?? []) stack.push(next)
  }
  return false
}

/**
 * Returns a user-facing message when the chosen prerequisites are not allowed, or undefined when they are fine.
 * A prerequisite must exist, must not be the task itself, must not loop back, and must not be due after the task.
 */
export function validateDependencies(tasks: Task[], taskId: string, dueDate: string, deps: string[]): string | undefined {
  if (deps.includes(taskId)) return 'A task cannot depend on itself.'
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const id of deps) {
    if (!byId.has(id)) return 'One of the selected prerequisites no longer exists.'
  }
  if (wouldCreateCycle(tasks, taskId, deps)) {
    return 'These prerequisites would create a loop, because one of them already depends on this task.'
  }
  const late = deps.map((id) => byId.get(id)).find((t) => t && t.dueDate > dueDate)
  if (late) return `"${late.title}" is due after this task. Move its date earlier or remove it as a prerequisite.`
  return undefined
}

/** Removes references to a deleted task so no task waits on something that no longer exists. */
export function dropDependencyRefs(tasks: Task[], removedId: string): Task[] {
  return tasks.map((t) => {
    if (!t.dependsOn?.includes(removedId)) return t
    const dependsOn = t.dependsOn.filter((d) => d !== removedId)
    const { dependsOn: _old, ...rest } = t
    return dependsOn.length ? { ...rest, dependsOn } : rest
  })
}
