import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldShellProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
}

interface ShellRender {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

function Shell({
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps & { children: (r: ShellRender) => ReactNode; className?: string }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${error ? ' field--error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {required && <span className="field__req" aria-hidden="true"> *</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="field__hint">{hint}</p>}
      {error && <p id={errId} className="field__error" role="alert">{error}</p>}
    </div>
  )
}

export function TextField({
  label, hint, error, required, className, ...rest
}: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Shell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input id={id} className="input" aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} {...rest} />
      )}
    </Shell>
  )
}

export function SelectField({
  label, hint, error, required, className, children, ...rest
}: FieldShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Shell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} className="input input--select" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest}>
          {children}
        </select>
      )}
    </Shell>
  )
}

export function TextAreaField({
  label, hint, error, required, className, ...rest
}: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Shell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} className="input input--area" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />
      )}
    </Shell>
  )
}

/** Search box with a visible-to-AT label but no visual label. */
export function SearchInput({
  label, className, ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={`search${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <svg className="search__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />
      </svg>
      <input id={id} type="search" className="input search__input" {...rest} />
    </div>
  )
}
