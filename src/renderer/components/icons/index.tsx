import type { ReactNode, SVGProps } from 'react'

/**
 * Hand-rolled icons rather than an icon package.
 *
 * Every icon set on npm is geometric — uniform stroke, mitred joins, exact
 * symmetry — which visibly fights a hand-painted background. Drawing the ~17
 * icons this app needs costs less than 200 lines, adds no dependency, and lets
 * every path use round caps/joins and slightly loose control points so the
 * icons look drawn rather than drafted.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconConvert(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 15.5a2.4 2.4 0 1 0 3.4 2.2V6.4l6.2-1.6" />
      <path d="M14.2 13.5 17 16.3l-2.8 2.8" />
      <path d="M11.6 16.3H17" />
    </Icon>
  )
}

export function IconArranger(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 7.2c2.9-1 5.9-1 8.8 0s5.9 1 8.4 0" />
      <path d="M3.5 12.1c2.9-1 5.9-1 8.8 0s5.9 1 8.4 0" />
      <path d="M3.5 17c2.9-1 5.9-1 8.8 0s5.9 1 8.4 0" />
      <circle cx="8.6" cy="12.1" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="7.2" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconPlay(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8.2 5.6c0-.8.8-1.3 1.5-.9l8 6.2c.7.4.7 1.4 0 1.9l-8 6.1c-.7.4-1.5-.1-1.5-.9z" fill="currentColor" />
    </Icon>
  )
}

export function IconPause(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9.3 4.8v14.4M14.8 4.8v14.4" strokeWidth={2.6} />
    </Icon>
  )
}

export function IconStop(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2.4" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconPrev(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6.3v11.4c0 .8-.9 1.3-1.6.8l-7.6-5.6c-.6-.4-.6-1.3 0-1.7l7.6-5.7c.7-.5 1.6 0 1.6.8z" fill="currentColor" />
      <path d="M6.2 5.8v12.4" strokeWidth={2.2} />
    </Icon>
  )
}

export function IconNext(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 6.3v11.4c0 .8.9 1.3 1.6.8l7.6-5.6c.6-.4.6-1.3 0-1.7L7.6 5.5C6.9 5 6 5.5 6 6.3z" fill="currentColor" />
      <path d="M17.8 5.8v12.4" strokeWidth={2.2} />
    </Icon>
  )
}

export function IconPanic(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 11.4V5.9a1.4 1.4 0 0 1 2.8 0v4.6" />
      <path d="M11.8 10.3V4.8a1.4 1.4 0 0 1 2.8 0v5.6" />
      <path d="M14.6 10.8V6.9a1.4 1.4 0 0 1 2.8 0v7.4c0 3.2-2.1 5.6-5.3 5.6-2.6 0-4-1.2-5.3-3.3l-2-3.4a1.4 1.4 0 0 1 2.3-1.6L9 13.4" />
    </Icon>
  )
}

export function IconSettings(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4" />
    </Icon>
  )
}

export function IconStar(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        d="M12 2.8c.5 3.9 2.5 6.2 6.6 7.1-4.1.9-6.1 3.2-6.6 7.1-.5-3.9-2.5-6.2-6.6-7.1 4.1-.9 6.1-3.2 6.6-7.1z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="17.8" cy="17.6" r="1.9" fill="currentColor" stroke="none" opacity="0.55" />
    </Icon>
  )
}

export function IconMoon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M19.4 14.6A7.7 7.7 0 0 1 9.3 4.7a8.1 8.1 0 1 0 10.1 9.9z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconTrash(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4.6 6.6h14.8" />
      <path d="M9.6 6.4V4.9c0-.7.6-1.3 1.3-1.3h2.2c.7 0 1.3.6 1.3 1.3v1.5" />
      <path d="M6.6 6.6l.8 12c0 .9.8 1.6 1.7 1.6h5.8c.9 0 1.7-.7 1.7-1.6l.8-12" />
      <path d="M10.4 10.4v6M13.6 10.4v6" />
    </Icon>
  )
}

export function IconFolder(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.4 6.6c0-.9.7-1.6 1.6-1.6h3.6l2 2.4h8c.9 0 1.6.7 1.6 1.6v8.4c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6z" />
    </Icon>
  )
}

export function IconFolderOpen(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.4 18.4V6.6c0-.9.7-1.6 1.6-1.6h3.6l2 2.4h6.8c.9 0 1.6.7 1.6 1.6v1.4" />
      <path d="M3.4 18.4 6 11.2c.2-.6.8-1 1.5-1h12.3c.8 0 1.4.8 1.2 1.6l-1.8 5.8c-.2.7-.9 1.2-1.6 1.2H4.6" />
    </Icon>
  )
}

export function IconUpload(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 15.6V4.4" />
      <path d="M7.8 8.4 12 4.2l4.2 4.2" />
      <path d="M4.4 15v3.6c0 .9.7 1.6 1.6 1.6h12c.9 0 1.6-.7 1.6-1.6V15" />
    </Icon>
  )
}

export function IconSave(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4.4 6c0-.9.7-1.6 1.6-1.6h9.4L19.6 8v10c0 .9-.7 1.6-1.6 1.6H6c-.9 0-1.6-.7-1.6-1.6z" />
      <path d="M8.2 4.6v4.2h6.4V4.6" />
      <path d="M8.2 19.4v-5.2h7.6v5.2" />
    </Icon>
  )
}

export function IconSpinner(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props} className={['animate-spin', props.className].filter(Boolean).join(' ')}>
      <path d="M12 3.4a8.6 8.6 0 1 1-8.4 10.3" opacity="0.9" />
    </Icon>
  )
}

export function IconMusic(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8.4 17.6a2.4 2.4 0 1 1-2.4-2.4c.9 0 1.7.5 2.1 1.2V5.6l10-2.2v10.8" />
      <path d="M20.5 14.2a2.4 2.4 0 1 1-2.4-2.4c.9 0 1.7.5 2.1 1.2" />
    </Icon>
  )
}
