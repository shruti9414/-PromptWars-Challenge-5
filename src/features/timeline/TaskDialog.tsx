import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Fields'
import { Modal } from '../../components/ui/Modal'
import { PRIORITY_LABEL } from '../../data/constants'
import { formatDate } from '../../lib/dates'
import { validateDependencies } from '../../lib/dependencies'
import { newId } from '../../lib/format'
import { sortTasks } from '../../lib/tasks'
import { hasErrors, validateTask } from '../../lib/validation'
import type { FieldErrors, TaskForm } from '../../lib/validation'
import type { Priority, Task } from '../../types'

interface Props {
  open: boolean
  task?: Task
  /** Every task of the event, used to pick prerequisites. */
  allTasks: Task[]
  defaultDate: string
  maxDate: string
  onClose: () => void
  onSave: (task: Task) => void
}

/** Mount with a `key` so the form resets for each task. */
export function TaskDialog({ open, task, allTasks, defaultDate, maxDate, onClose, onSave }: Props) {
  const [taskId] = useState(() => task?.id ?? newId())
  const [form, setForm] = useState<TaskForm>({
    title: task?.title ?? '',
    dueDate: task?.dueDate ?? defaultDate,
    priority: task?.priority ?? 'medium',
  })
  const [deps, setDeps] = useState<string[]>(() => task?.dependsOn ?? [])
  const [depError, setDepError] = useState<string>()
  const [errors, setErrors] = useState<FieldErrors<TaskForm>>({})
  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const options = sortTasks(allTasks.filter((t) => t.id !== taskId))
  const toggleDep = (id: string) => {
    setDepError(undefined)
    setDeps((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
  }

  const submit = () => {
    const result = validateTask(form, { maxDate, keep: task?.dueDate })
    setErrors(result.errors)
    const problem = hasErrors(result.errors) ? undefined : validateDependencies(allTasks, taskId, form.dueDate, deps)
    setDepError(problem)
    if (hasErrors(result.errors) || problem) return
    const { dependsOn: _previous, ...rest } = task ?? ({} as Partial<Task>)
    onSave({
      ...rest,
      ...(deps.length ? { dependsOn: deps } : {}),
      manual: true,
      id: taskId,
      title: result.value.title,
      dueDate: form.dueDate,
      priority: form.priority,
      done: task?.done ?? false,
    })
  }

  return (
    <Modal
      open={open}
      title={task ? 'Edit task' : 'Add task'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{task ? 'Save changes' : 'Add task'}</Button>
        </>
      }
    >
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
        <TextField className="span-2" label="Task" required value={form.title} error={errors.title} maxLength={140} autoComplete="off" onChange={(e) => set('title', e.target.value)} />
        <TextField label="Due date" type="date" required value={form.dueDate} max={maxDate > form.dueDate ? maxDate : form.dueDate} error={errors.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        <SelectField label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </SelectField>
        {options.length > 0 && (
          <fieldset className="fieldset span-2 deps" aria-describedby="deps-hint">
            <legend className="field__label">Do these first (optional)</legend>
            <p id="deps-hint" className="field__hint">Pick tasks that must be finished before this one. Loops and later-dated prerequisites are not allowed.</p>
            <ul className="deps__list">
              {options.map((t) => (
                <li key={t.id}>
                  <label className="check-inline">
                    <input type="checkbox" checked={deps.includes(t.id)} onChange={() => toggleDep(t.id)} />
                    {t.title} <span className="muted">({formatDate(t.dueDate, 'short')})</span>
                  </label>
                </li>
              ))}
            </ul>
            {depError && <p className="field__error" role="alert">{depError}</p>}
          </fieldset>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
      </form>
    </Modal>
  )
}
