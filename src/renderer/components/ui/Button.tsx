import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { IconSpinner } from '../icons'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-star-500 text-night-950 shadow-[0_6px_18px_-8px_rgb(232_178_58/.9)] hover:bg-star-400 active:bg-star-600',
  secondary:
    'bg-night-800/80 text-moon-100 ring-1 ring-cobalt-600/35 hover:bg-night-700/85 hover:ring-cobalt-500/50',
  ghost: 'text-moon-300 hover:bg-night-800/70 hover:text-moon-100',
  danger:
    'bg-vermilion-600 text-moon-50 shadow-[0_6px_18px_-8px_rgb(169_59_51/.95)] hover:bg-vermilion-500 active:bg-vermilion-700',
  success:
    'bg-cypress-600 text-moon-50 shadow-[0_6px_18px_-8px_rgb(47_90_65/.95)] hover:bg-cypress-500 active:bg-cypress-700'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-2.5 py-1 text-xs rounded-tile',
  md: 'gap-2 px-3.5 py-2 text-sm rounded-tile',
  lg: 'gap-2.5 px-5 py-2.5 text-[15px] rounded-card'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and disables the button. */
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold transition-[background-color,box-shadow,transform,color] duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        'active:translate-y-px',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <IconSpinner size={size === 'sm' ? 13 : 15} /> : icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children'> {
  /** Required — these buttons have no visible text. */
  label: string
  icon: ReactNode
}

export function IconButton({ label, icon, className, ...rest }: IconButtonProps): React.JSX.Element {
  return (
    <Button aria-label={label} title={label} className={cn('!px-2 !py-2', className)} {...rest}>
      {icon}
    </Button>
  )
}
