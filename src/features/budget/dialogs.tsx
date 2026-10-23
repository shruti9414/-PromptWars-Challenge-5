import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Fields'
import { Modal } from '../../components/ui/Modal'
import { CATEGORIES } from '../../data/constants'
import { newId } from '../../lib/format'
import { hasErrors, validateBudgetTotal, validateExpense } from '../../lib/validation'
import type { ExpenseForm, FieldErrors } from '../../lib/validation'
import type { CategoryId, Expense } from '../../types'

interface ExpenseDialogProps {
  open: boolean
  expense?: Expense
  onClose: () => void
  onSave: (expense: Expense) => void
}

/** Mount with a `key` so the form resets each time it opens for a different expense. */
export function ExpenseDialog({ open, expense, onClose, onSave }: ExpenseDialogProps) {
  // One id per opened dialog, so a repeated click on Save updates the same record instead of adding a copy.
  const [expenseId] = useState(() => expense?.id ?? newId())
  const [form, setForm] = useState<ExpenseForm>({
    title: expense?.title ?? '',
    category: expense?.category ?? 'venue',
    estimated: expense ? String(expense.estimated) : '',
    actual: expense?.actual != null ? String(expense.actual) : '',
  })
  const [errors, setErrors] = useState<FieldErrors<ExpenseForm>>({})
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    const result = validateExpense(form)
    setErrors(result.errors)
    if (hasErrors(result.errors)) return
    onSave({
      ...expense,
      manual: true,
      id: expenseId,
      title: result.value.title,
      category: form.category,
      estimated: result.value.estimated,
      actual: result.value.actual,
      paid: expense?.paid ?? false,
    })
  }

  return (
    <Modal
      open={open}
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{expense ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
        <TextField className="span-2" label="Expense" required value={form.title} error={errors.title} maxLength={100} autoComplete="off" onChange={(e) => set('title', e.target.value)} />
        <SelectField className="span-2" label="Category" value={form.category} onChange={(e) => set('category', e.target.value as CategoryId)}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <TextField label="Planned amount" required inputMode="decimal" value={form.estimated} error={errors.estimated} autoComplete="off" onChange={(e) => set('estimated', e.target.value)} />
        <TextField label="Actual amount" inputMode="decimal" value={form.actual} error={errors.actual} hint="Leave blank until you have a final bill." autoComplete="off" onChange={(e) => set('actual', e.target.value)} />
        <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
      </form>
    </Modal>
  )
}

export function BudgetTotalDialog({
  open, total, onClose, onSave,
}: { open: boolean; total: number; onClose: () => void; onSave: (total: number) => void }) {
  const [value, setValue] = useState(String(total))
  const [error, setError] = useState<string | undefined>()
  const submit = () => {
    const result = validateBudgetTotal(value)
    setError(result.error)
    if (!result.error) onSave(result.value)
  }
  return (
    <Modal
      open={open}
      title="Adjust total budget"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Save budget</Button>
        </>
      }
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
        <TextField label="Total budget" required inputMode="numeric" value={value} error={error} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
      </form>
    </Modal>
  )
}

