import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { Icon } from './Icon'
import type { IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light'
type Size = 'sm' | 'md' | 'lg'

interface Common {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconAfter?: IconName
}

const cls = (variant: Variant, size: Size, extra?: string) => `btn btn--${variant} btn--${size}${extra ? ` ${extra}` : ''}`

function Content({ icon, iconAfter, children }: Pick<Common, 'icon' | 'iconAfter'> & { children: ReactNode }) {
  return (
    <>
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={18} />}
    </>
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  className,
  children,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls(variant, size, className)} {...rest}>
      <Content icon={icon} iconAfter={iconAfter}>{children}</Content>
    </button>
  )
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  className,
  children,
  ...rest
}: Common & LinkProps) {
  return (
    <Link className={cls(variant, size, className)} {...rest}>
      <Content icon={icon} iconAfter={iconAfter}>{children}</Content>
    </Link>
  )
}

/** Square icon-only button. `label` becomes the accessible name. */
export function IconButton({
  icon,
  label,
  className,
  ...rest
}: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn${className ? ` ${className}` : ''}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  )
}
