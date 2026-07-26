import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { PaintDaub, type DaubTone } from './paint'
import { IconSpinner } from '../icons'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Two kinds of button, not five styles of the same rectangle.
 *
 * A **daub** — primary, danger, success — is a single loaded press of the brush
 * with a label on it. There should be one on screen at a time; it is the thing
 * the page is for.
 *
 * Everything else is **typographic**: the words, with a brush stroke under them
 * that thickens on hover. No fill, no border, no radius, and none of the broad
 * coloured glow shadows the old buttons carried — light in this palette comes
 * from stars, and a "Change…" button is not a star.
 */
const DAUB_VARIANTS: Partial<Record<ButtonVariant, { tone: DaubTone; text: string }>> = {
  primary: { tone: 'gold', text: 'text-night-950' },
  danger: { tone: 'vermilion', text: 'text-moon-50' },
  success: { tone: 'cypress', text: 'text-moon-50' }
}

const DAUB_SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-4 py-1.5 text-xs',
  md: 'gap-2 px-6 py-2.5 text-sm',
  lg: 'gap-2.5 px-8 py-3 text-[15px]'
}

const TYPE_SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 text-xs',
  md: 'gap-2 text-sm',
  lg: 'gap-2.5 text-[15px]'
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
  const daub = DAUB_VARIANTS[variant]
  const mark = loading ? <IconSpinner size={size === 'sm' ? 13 : 15} /> : icon

  if (daub) {
    return (
      <button
        disabled={disabled || loading}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center font-semibold',
          'transition-transform duration-150 active:translate-y-px',
          'disabled:pointer-events-none disabled:opacity-40',
          DAUB_SIZES[size],
          daub.text,
          className
        )}
        {...rest}
      >
        <PaintDaub tone={daub.tone} />
        <span className="relative inline-flex items-center gap-2">
          {mark}
          {children}
        </span>
      </button>
    )
  }

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'ghost'
          ? 'text-moon-400 hover:text-moon-100'
          : 'brush-underline text-moon-200 hover:text-star-200',
        TYPE_SIZES[size],
        className
      )}
      {...rest}
    >
      {mark}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children'> {
  /** Required — these buttons have no visible text. */
  label: string
  icon: ReactNode
}

/** No underline: there is no baseline to sit under, only a glyph. */
export function IconButton({ label, icon, className, ...rest }: IconButtonProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      className={cn('p-1.5', className)}
      {...rest}
    >
      {icon}
    </Button>
  )
}
