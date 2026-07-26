import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from './cn'

/* ---------------------------------------------------------------------------
 * Field wrapper
 * ------------------------------------------------------------------------ */

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  /**
   * When true the whole thing renders as a `<label>` wrapping its control
   * (implicit labelling). Several existing controls rely on this — keep it for
   * anything that had `<label>…<input/></label>` before.
   */
  wrap?: boolean
  className?: string
  children: ReactNode
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  wrap = false,
  className,
  children
}: FieldProps): React.JSX.Element {
  const body = (
    <>
      <span className="smallcaps block text-[0.82rem] text-moon-200">{label}</span>
      {hint && <span className="mt-1 block max-w-[60ch] text-xs leading-relaxed text-moon-400">{hint}</span>}
      <span className="mt-2 block">{children}</span>
      {error && <span className="mt-1 block text-xs text-vermilion-400">{error}</span>}
    </>
  )

  if (wrap) return <label className={cn('block', className)}>{body}</label>
  return <div className={cn('block', className)}>{htmlFor ? <label htmlFor={htmlFor}>{body}</label> : body}</div>
}

/* ---------------------------------------------------------------------------
 * Controls. These stay native elements throughout — rebuilding a range input or
 * a checkbox would risk the behaviour the app depends on (seek commit on
 * mouseup/keyup, drag-and-drop, accent colours). Styling only.
 *
 * Inputs are ruled, not boxed: a single line under the value, the way a form is
 * ruled on paper. A page of bordered, rounded, inset-shadowed input boxes was a
 * large part of what made the old UI read as generated, and the box was never
 * carrying any information the rule doesn't.
 * ------------------------------------------------------------------------ */

const CONTROL_BASE =
  'w-full border-0 border-b border-cobalt-600/40 bg-night-950/35 px-1.5 py-1.5 text-sm text-moon-100 ' +
  'transition-colors placeholder:text-moon-500 hover:border-cobalt-400/60 ' +
  'focus:border-star-400 focus:outline-none disabled:opacity-50'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input type="text" className={cn(CONTROL_BASE, className)} {...rest} />
}

const NUMBER_WIDTHS = { xs: 'w-20', sm: 'w-28', full: 'w-full' } as const

export function NumberInput({
  width = 'full',
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { width?: keyof typeof NUMBER_WIDTHS }): React.JSX.Element {
  return <input type="number" className={cn(CONTROL_BASE, NUMBER_WIDTHS[width], className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={cn(CONTROL_BASE, 'cursor-pointer appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export interface CheckboxProps {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Checkbox({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  className
}: CheckboxProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 text-sm text-moon-200',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
      />
      <span className="min-w-0">
        <span className="block leading-snug">{label}</span>
        {hint && <span className="mt-1 block max-w-[60ch] text-xs leading-relaxed text-moon-400">{hint}</span>}
      </span>
    </label>
  )
}

export interface RadioGroupProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string }[]
  name?: string
  className?: string
}

/**
 * Choices set as words, with a brush stroke under the one in force. Still real
 * radio inputs underneath — only the segmented pill (and its gold fill and drop
 * shadow) is gone.
 */
export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  name,
  className
}: RadioGroupProps<T>): React.JSX.Element {
  return (
    <div className={cn('inline-flex flex-wrap items-baseline gap-x-6 gap-y-2', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <label
            key={option.value}
            title={option.hint}
            className={cn(
              'cursor-pointer text-sm font-semibold transition-colors',
              active ? 'brush-underline text-star-200' : 'text-moon-400 hover:text-moon-100'
            )}
          >
            <input
              type="radio"
              name={name}
              checked={active}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Themed range input. Chromium is the only target, so `::-webkit-slider-*`
 * arbitrary variants are enough — and crucially every native handler the caller
 * passes (onChange / onMouseUp / onTouchEnd / onKeyUp) is forwarded untouched,
 * because PlayMusicMode's seek-commit behaviour depends on all four.
 *
 * The thumb keeps its glow: it is the one control in the app that genuinely is
 * a star.
 */
export function Slider({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      type="range"
      className={cn(
        'h-4 cursor-pointer appearance-none bg-transparent',
        '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-cobalt-600/60',
        '[&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill',
        '[&::-webkit-slider-thumb]:bg-star-300 [&::-webkit-slider-thumb]:shadow-star',
        '[&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110',
        className
      )}
      {...rest}
    />
  )
}
