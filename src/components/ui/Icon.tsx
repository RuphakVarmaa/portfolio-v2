import type { ReactElement, SVGProps } from 'react'

/**
 * The site's icons: inline SVG drawn in the same stroke language as the drawings (round caps and
 * joins, 1.75 stroke, no fills). No icon library. `currentColor` everywhere, so an icon takes the
 * colour of the text it sits in.
 */

export type IconName =
  | 'copy'
  | 'check'
  | 'external'
  | 'pdf'
  | 'sun'
  | 'moon'
  | 'gauge'
  | 'play'
  | 'stop'
  | 'plug'
  | 'menu'
  | 'close'
  | 'volume'
  | 'volume-off'
  | 'help'
  | 'arrow-right'
  | 'camera'
  | 'image'
  | 'text'
  | 'machine'
  | 'upload'

const PATHS: Record<IconName, ReactElement> = {
  copy: (
    <>
      <path d="M9 8.5h9.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5V10A1.5 1.5 0 0 1 9 8.5z" />
      <path d="M16 8.5V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h2" />
    </>
  ),
  check: <path d="M4.2 12.6l5 4.9L19.8 6.6" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9.2 9.2" />
      <path d="M18 14.2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8" />
    </>
  ),
  pdf: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3.2V8h4.8" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.8h4.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.9" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.6A8.4 8.4 0 0 1 9.4 4 8.4 8.4 0 1 0 20 14.6z" />,
  gauge: (
    <>
      <path d="M4 17.5a8 8 0 1 1 16 0" />
      <path d="M12 17.5l3.8-5.2" />
      <path d="M6.6 17.5h1.9M15.5 17.5h1.9" />
    </>
  ),
  play: <path d="M7.5 4.6l11.4 7.4-11.4 7.4z" />,
  stop: <path d="M6.2 6.2h11.6v11.6H6.2z" />,
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v2.8a6 6 0 0 1-12 0z" />
      <path d="M12 16.8V21" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  volume: (
    <>
      <path d="M4 10v4h3.2l4.8 3.8V6.2L7.2 10z" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.2 6.6a8 8 0 0 1 0 10.8" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 10v4h3.2l4.8 3.8V6.2L7.2 10z" />
      <path d="M16 9.6l4.6 4.8M20.6 9.6L16 14.4" />
    </>
  ),
  help: (
    <>
      <path d="M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.9.5-1.3 1.1-1.3 2" />
      <path d="M12 17.6v.1" />
    </>
  ),
  'arrow-right': <path d="M4 12h15.5M13.6 6l6 6-6 6" />,
  camera: (
    <>
      <path d="M4 8.2h3.2l1.5-2.2h6.6l1.5 2.2H20v10.6H4z" />
      <circle cx="12" cy="13.3" r="3.2" />
    </>
  ),
  image: (
    <>
      <path d="M4 5.2h16v13.6H4z" />
      <path d="M4 16l4.8-4.8 4 4 3-3L20 16.4" />
      <path d="M9 9.2v.1" />
    </>
  ),
  text: <path d="M5 6.5h14M5 11.5h14M5 16.5h9" />,
  machine: (
    <>
      <path d="M4 6.2h16v11.6H4z" />
      <path d="M8.2 9.8v4.4M12 9.8v4.4M15.8 9.8v4.4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4.5M7.4 9l4.6-4.6L16.6 9" />
      <path d="M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  name: IconName
  /** Pixel size (width and height). Default 20. */
  size?: number
  /** Give the icon an accessible name. Without it the icon is decorative (`aria-hidden`). */
  title?: string
}

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
