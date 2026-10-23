import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Fields'
import { Modal } from '../../components/ui/Modal'
import { GUEST_GROUP_LABEL, RSVP_LABEL } from '../../data/constants'
import { newId } from '../../lib/format'
import { hasErrors, validateGuest } from '../../lib/validation'
import type { FieldErrors, GuestForm } from '../../lib/validation'
import type { Guest, GuestGroup, RsvpStatus } from '../../types'

interface Props {
  open: boolean
  guest?: Guest
  onClose: () => void
  onSave: (guest: Guest) => void
}

/** Mount with a `key` so the form resets for each guest. */
export function GuestDialog({ open, guest, onClose, onSave }: Props) {
  const [form, setForm] = useState<GuestForm>({
    name: guest?.name ?? '',
    group: guest?.group ?? 'friends',
    rsvp: guest?.rsvp ?? 'pending',
    plusOnes: guest ? String(guest.plusOnes) : '0',
    dietary: guest?.dietary ?? '',
  })
  const [errors, setErrors] = useState<FieldErrors<GuestForm>>({})
  const set = <K extends keyof GuestForm>(k: K, v: GuestForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    const result = validateGuest(form)
    setErrors(result.errors)
    if (hasErrors(result.errors)) return
    onSave({ id: guest?.id ?? newId(), name: result.value.name, group: form.group, rsvp: form.rsvp, plusOnes: result.value.plusOnes, dietary: result.value.dietary })
  }

  return (
    <Modal
      open={open}
      title={guest ? 'Edit guest' : 'Add guest'}
      description="Only a name and RSVP details are stored, in this browser."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{guest ? 'Save changes' : 'Add guest'}</Button>
        </>
      }
    >
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
        <TextField className="span-2" label="Name" required value={form.name} error={errors.name} maxLength={100} autoComplete="off" onChange={(e) => set('name', e.target.value)} />
        <SelectField label="Group" value={form.group} onChange={(e) => set('group', e.target.value as GuestGroup)}>
          {(Object.keys(GUEST_GROUP_LABEL) as GuestGroup[]).map((g) => <option key={g} value={g}>{GUEST_GROUP_LABEL[g]}</option>)}
        </SelectField>
        <SelectField label="RSVP" value={form.rsvp} onChange={(e) => set('rsvp', e.target.value as RsvpStatus)}>
          {(Object.keys(RSVP_LABEL) as RsvpStatus[]).map((r) => <option key={r} value={r}>{RSVP_LABEL[r]}</option>)}
        </SelectField>
        <TextField label="Plus-ones" inputMode="numeric" value={form.plusOnes} error={errors.plusOnes} autoComplete="off" onChange={(e) => set('plusOnes', e.target.value)} />
        <TextField label="Dietary needs" value={form.dietary} error={errors.dietary} maxLength={80} autoComplete="off" onChange={(e) => set('dietary', e.target.value)} />
        <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
      </form>
    </Modal>
  )
}
