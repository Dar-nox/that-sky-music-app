import { useRef, useState, type DragEvent, type ChangeEvent, type ReactNode } from 'react'
import { cn } from './cn'
import { Button } from './Button'
import { PaintFrame } from './paint'
import { IconUpload } from '../icons'

export interface DropZoneProps {
  onFiles: (files: File[]) => void | Promise<void>
  /** e.g. '.mid,.midi' or '.json,.txt' */
  accept: string
  multiple?: boolean
  busy?: boolean
  title: string
  hint?: ReactNode
  buttonLabel: string
  busyLabel?: string
  compact?: boolean
  className?: string
}

/**
 * Owns its own drag state and hidden file input. Used for both the MIDI pickers
 * and the sheet importer, so all three get drag-and-drop from one place.
 *
 * Resets `input.value` after every selection, so picking the same file twice in
 * a row still fires a change event.
 */
export function DropZone({
  onFiles,
  accept,
  multiple = false,
  busy = false,
  title,
  hint,
  buttonLabel,
  busyLabel,
  compact = false,
  className
}: DropZoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragOver(false)
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) await onFiles(files)
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) await onFiles(files)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
      className={cn(
        'relative flex flex-col items-center text-center transition-colors',
        compact ? 'gap-1.5 px-4 py-5' : 'gap-2.5 px-6 py-9',
        dragOver ? 'bg-star-700/12 text-star-200' : 'bg-night-950/25 text-moon-400',
        className
      )}
    >
      {/* Not dashed. A dash pattern stretched across a wide box degenerates into
          an evenly-spaced CSS-looking dashed border, which is precisely the
          stock component this design is trying not to be. The words already say
          it takes a drop; the edge only has to say "this region". */}
      <PaintFrame
        stroke={dragOver ? 'var(--color-star-400)' : 'var(--color-cobalt-400)'}
        strokeOpacity={dragOver ? 0.85 : 0.34}
      />
      <span className={cn('relative text-star-600', dragOver && 'text-star-300')}>
        <IconUpload size={compact ? 18 : 24} />
      </span>
      <p
        className={cn(
          'relative font-display font-medium text-moon-200 italic',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {title}
      </p>
      {hint && <p className="relative max-w-[42ch] text-xs leading-relaxed text-moon-400">{hint}</p>}
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        loading={busy}
        onClick={() => inputRef.current?.click()}
        className="relative mt-1.5"
      >
        {busy ? (busyLabel ?? 'Working…') : buttonLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => void handleChange(e)}
        className="hidden"
      />
    </div>
  )
}
