import type { ReactNode } from 'react'
import { PageContainer, PageHeader } from '../layout/Page'
import { Alert, Badge, Button, Card, DropZone, SectionHeading, cn } from '../ui'
import { IconMusic } from '../icons'

/**
 * The shared chrome for Convert Mode and the Arranger: pick a file, tune
 * options, run it, read the report.
 *
 * This is purely presentational — it hoists no state. Each page keeps every
 * `useState`, every handler and every IPC call it already had, and passes its
 * own (entirely different) option controls and report body in as slots. Only
 * the surrounding layout is shared.
 */
export interface MidiWorkbenchProps {
  title: string
  intro: ReactNode
  fileName: string | null
  /** Chips shown beside the file name once a file is parsed (track count, key…). */
  fileBadges?: ReactNode
  onFiles: (files: File[]) => void | Promise<void>
  error: string | null
  /** Rendered once a file is parsed. */
  optionsSlot: ReactNode
  actionLabel: string
  actionBusyLabel: string
  actionBusy: boolean
  actionDisabled: boolean
  actionWarning?: string | null
  onAction: () => void
  reportSlot?: ReactNode
}

export function MidiWorkbench({
  title,
  intro,
  fileName,
  fileBadges,
  onFiles,
  error,
  optionsSlot,
  actionLabel,
  actionBusyLabel,
  actionBusy,
  actionDisabled,
  actionWarning,
  onAction,
  reportSlot
}: MidiWorkbenchProps): React.JSX.Element {
  const hasFile = fileName !== null

  return (
    <>
      <PageHeader title={title} description={intro} />

      <PageContainer>
        {/* Step 1 — source file */}
        <Step index={1} label="Choose a MIDI file">
          {hasFile ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-star-500">
                <IconMusic size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-moon-100">
                {fileName}
              </span>
              {fileBadges}
              <DropZoneButton onFiles={onFiles} />
            </div>
          ) : (
            <DropZone
              accept=".mid,.midi"
              title="Drop a .mid or .midi file here"
              hint="Notes are quantized to the nearest diatonic scale degree, then mapped onto the 15-key grid."
              buttonLabel="Choose MIDI file"
              onFiles={onFiles}
            />
          )}
        </Step>

        {error && <Alert tone="error">{error}</Alert>}

        {/* Step 2 — options */}
        {hasFile && (
          <Step index={2} label="Shape the sheet">
            <div className="space-y-5">{optionsSlot}</div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-cobalt-700/25 pt-4">
              {actionWarning && (
                <span className="mr-auto text-xs font-semibold text-ochre-300">{actionWarning}</span>
              )}
              <Button
                variant="primary"
                size="lg"
                loading={actionBusy}
                disabled={actionDisabled}
                onClick={onAction}
              >
                {actionBusy ? actionBusyLabel : actionLabel}
              </Button>
            </div>
          </Step>
        )}

        {/* Step 3 — report */}
        {reportSlot && (
          <Step index={3} label="Review">
            {reportSlot}
          </Step>
        )}
      </PageContainer>
    </>
  )
}

/** A numbered card with a gold paint-dot in the gutter. */
function Step({
  index,
  label,
  children
}: {
  index: number
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="relative pl-9">
      <span
        className={cn(
          'absolute top-5 left-0 flex h-7 w-7 items-center justify-center rounded-pill',
          'bg-star-500/20 font-display text-xs font-bold text-star-300 ring-1 ring-star-500/40'
        )}
      >
        {index}
      </span>
      <Card>
        <SectionHeading level={3} title={label} />
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  )
}

/** The compact "swap file" affordance shown once a file is already loaded. */
function DropZoneButton({ onFiles }: { onFiles: MidiWorkbenchProps['onFiles'] }): React.JSX.Element {
  return (
    <label className="cursor-pointer">
      <span className="inline-flex items-center rounded-tile bg-night-800/80 px-2.5 py-1 text-xs font-semibold text-moon-200 ring-1 ring-cobalt-600/35 hover:bg-night-700/85">
        Change…
      </span>
      <input
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) void onFiles(files)
        }}
      />
    </label>
  )
}

/** Small labelled grouping used inside `optionsSlot` by both pages. */
export function OptionGroup({
  label,
  children,
  className
}: {
  label: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="mb-2 text-[11px] font-bold tracking-[0.14em] text-star-500 uppercase">
        {label}
      </legend>
      {children}
    </fieldset>
  )
}

/** Scrollable checkbox list of MIDI tracks — identical in both pages. */
export function TrackList({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="paint-inset scrollbar-night max-h-52 space-y-1.5 overflow-auto rounded-tile p-2.5">
      {children}
    </div>
  )
}

export function TrackBadge({ children }: { children: ReactNode }): React.JSX.Element {
  return <Badge>{children}</Badge>
}
