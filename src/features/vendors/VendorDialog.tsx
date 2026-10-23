import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextAreaField, TextField } from '../../components/ui/Fields'
import { Modal } from '../../components/ui/Modal'
import { VENDOR_CATEGORIES, VENDOR_STATUSES, VENDOR_STATUS_LABEL } from '../../data/constants'
import { newId } from '../../lib/format'
import { hasErrors, validateVendor } from '../../lib/validation'
import type { FieldErrors, VendorForm } from '../../lib/validation'
import type { CategoryId, VendorBooking, VendorStatus } from '../../types'

interface Props {
  open: boolean
  vendor?: VendorBooking
  onClose: () => void
  onSave: (vendor: VendorBooking) => void
}

/** Mount with a `key` so the form resets for each vendor. */
export function VendorDialog({ open, vendor, onClose, onSave }: Props) {
  const [form, setForm] = useState<VendorForm>({
    name: vendor?.name ?? '',
    category: vendor?.category ?? 'venue',
    status: vendor?.status ?? 'to-research',
    quote: vendor?.quote != null ? String(vendor.quote) : '',
    notes: vendor?.notes ?? '',
  })
  const [errors, setErrors] = useState<FieldErrors<VendorForm>>({})
  const set = <K extends keyof VendorForm>(k: K, v: VendorForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    const result = validateVendor(form)
    setErrors(result.errors)
    if (hasErrors(result.errors)) return
    onSave({
      ...vendor,
      manual: true,
      id: vendor?.id ?? newId(),
      category: form.category,
      status: form.status,
      name: result.value.name,
      quote: result.value.quote,
      notes: result.value.notes,
    })
  }

  return (
    <Modal
      open={open}
      title={vendor ? 'Edit vendor' : 'Add vendor'}
      description="Vendors you add here are your own notes. Nothing is sent to anyone."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{vendor ? 'Save changes' : 'Add vendor'}</Button>
        </>
      }
    >
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
        <TextField className="span-2" label="Vendor name" required value={form.name} error={errors.name} maxLength={100} autoComplete="off" onChange={(e) => set('name', e.target.value)} />
        <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value as CategoryId)}>
          {VENDOR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <SelectField label="Status" value={form.status} onChange={(e) => set('status', e.target.value as VendorStatus)}>
          {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{VENDOR_STATUS_LABEL[s]}</option>)}
        </SelectField>
        <TextField className="span-2" label="Quote" inputMode="decimal" value={form.quote} error={errors.quote} hint="Optional. Leave blank if you have no quote yet." autoComplete="off" onChange={(e) => set('quote', e.target.value)} />
        <TextAreaField className="span-2" label="Notes" rows={3} value={form.notes} error={errors.notes} maxLength={320} onChange={(e) => set('notes', e.target.value)} />
        <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
      </form>
    </Modal>
  )
}

