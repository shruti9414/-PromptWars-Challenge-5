import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Fields'
import { Modal } from '../../components/ui/Modal'
import { PRIORITY_LABEL } from '../../data/constants'
import { newId } from '../../lib/format'
import { hasErrors, validateTask } from '../../lib/validation'
import type { FieldErrors, TaskForm } from '../../lib/validation'
import type { Priority, Task } from '../../types'

interface Props {
  open: boolean
  task?: Task
  defaultDate: string
  maxDate: string
  onClose: () => void
  onSave: (task: Task) => void
}

/** Mount with a `key` so the form resets for each task. */
export function TaskDialog({ open, task, defaultDate, maxDate, onClose, onSave }: Props) {
  const [form, setForm] = useState<TaskForm>({
    title: task?.title ?? '',
    dueDate: task?.dueDate ?? defaultDate,
    priority: task?.priority ?? 'medium',
  })
  const [errors, setErrors] = useState<FieldErrors<TaskForm>>({})
  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    const result = validateTask(form)
    setErrors(result.errors)
    if (hasErrors(result.errors)) return
    onSave({
      ...task,
      manual: true,
      id: task?.id ?? newId(),
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
        <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
      </form>
    </Modal>
  )
}

