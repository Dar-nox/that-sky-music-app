import { useRef, useState, type DragEvent, type ChangeEvent, type ReactNode } from 'react'
import { cn } from './cn'
import { Button } from './Button'
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
        'flex flex-col items-center rounded-card border-2 border-dashed text-center transition-colors',
        compact ? 'gap-1.5 px-3 py-4' : 'gap-2 px-5 py-7',
        dragOver
          ? 'border-star-400/80 bg-star-700/15 text-star-200'
          : 'border-cobalt-600/35 bg-night-950/35 text-moon-400 hover:border-cobalt-500/55',
        className
      )}
    >
      <span className={cn('text-star-500/80', dragOver && 'text-star-300')}>
        <IconUpload size={compact ? 18 : 24} />
      </span>
      <p className={cn('font-display font-semibold text-moon-200', compact ? 'text-xs' : 'text-sm')}>{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-moon-400">{hint}</p>}
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        loading={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-1"
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
