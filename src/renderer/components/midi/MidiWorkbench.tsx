import type { ReactNode } from 'react'
import { PageContainer, PageHeader } from '../layout/Page'
import { Alert, Annotation, Button, DropZone, Movement, cn } from '../ui'
import { IconMusic } from '../icons'

/**
 * The shared chrome for Convert Mode and the Arranger: pick a file, tune
 * options, run it, read the report.
 *
 * This is purely presentational — it hoists no state. Each page keeps every
 * `useState`, every handler and every IPC call it already had, and passes its
 * own (entirely different) option controls and report body in as slots. Only
 * the surrounding layout is shared.
 *
 * The three stages used to be three numbered `<Card>`s. They are now three
 * `Movement`s: the same sequence, but running on the canvas with the numeral in
 * the gutter, so a two-step page doesn't look like a dashboard of three
 * unrelated widgets.
 */
export interface MidiWorkbenchProps {
  title: string
  intro: ReactNode
  fileName: string | null
  /** Annotations shown beside the file name once a file is parsed (track count, key…). */
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
        <Movement index={1} title="Source">
          {hasFile ? (
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <span className="translate-y-0.5 text-star-600">
                <IconMusic size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-lg font-medium text-moon-50">
                {fileName}
              </span>
              {fileBadges}
              <ChangeFileButton onFiles={onFiles} />
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
          {error && <Alert tone="error" className="mt-5">{error}</Alert>}
        </Movement>

        {hasFile && (
          <Movement index={2} title="Shape the sheet">
            {optionsSlot}

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Button
                variant="primary"
                size="lg"
                loading={actionBusy}
                disabled={actionDisabled}
                onClick={onAction}
              >
                {actionBusy ? actionBusyLabel : actionLabel}
              </Button>
              {actionWarning && <span className="text-sm text-ochre-300">{actionWarning}</span>}
            </div>
          </Movement>
        )}

        {reportSlot && (
          <Movement index={3} title="Review" rule={false}>
            {reportSlot}
          </Movement>
        )}
      </PageContainer>
    </>
  )
}

/** The compact "swap file" affordance shown once a file is already loaded. */
function ChangeFileButton({ onFiles }: { onFiles: MidiWorkbenchProps['onFiles'] }): React.JSX.Element {
  return (
    <label className="cursor-pointer">
      <span className="brush-underline text-sm font-semibold text-moon-300 hover:text-star-200">Change…</span>
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

/**
 * A labelled grouping inside `optionsSlot`.
 *
 * The legend was an 11px bold uppercase letterspaced gold label — the same
 * eyebrow pattern `SectionHeading` dropped. It is now set in the display face
 * over a hairline, which reads as a subhead instead of a category chip.
 */
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
    <fieldset className={cn('min-w-0', className)}>
      {/*
        The visible subhead is a sibling `<div>`, not the `<legend>` itself: a
        legend is laid out in the fieldset's border gap rather than in normal
        flow, which makes a full-width rule on it behave unpredictably. The
        legend stays for the accessible grouping name.
      */}
      <legend className="sr-only">{label}</legend>
      <div
        aria-hidden="true"
        className="hairline-top mb-5 pt-2.5 font-display text-base font-medium text-moon-300 italic"
      >
        {label}
      </div>
      <div className="space-y-5">{children}</div>
    </fieldset>
  )
}

/** Scrollable checkbox list of MIDI tracks — identical in both pages. */
export function TrackList({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="paint-inset scrollbar-night max-h-52 space-y-2 overflow-auto rounded-tile p-3">{children}</div>
  )
}

export function TrackBadge({ children }: { children: ReactNode }): React.JSX.Element {
  return <Annotation>{children}</Annotation>
}
