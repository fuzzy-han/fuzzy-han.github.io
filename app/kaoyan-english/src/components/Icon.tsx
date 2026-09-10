import type { SVGProps } from 'react'

/* ==========================================================================
   图标 — 单色线性描边，尺寸随字号，颜色继承 currentColor
   （自行手写，不引第三方图标库，避免风格被带偏）
   ========================================================================== */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
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

export const IconWorkbench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 13.5h11" />
    <path d="M3.5 13.5V5.2a.7.7 0 0 1 .7-.7h7.6a.7.7 0 0 1 .7.7v8.3" />
    <path d="M6 8.2h4M6 10.6h4" />
    <path d="M8 2.2v2.3" />
  </Svg>
)

export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.6-3.7" />
    <path d="M3 2.6V5h2.4" />
    <path d="M8 5.4V8l1.9 1.2" />
  </Svg>
)

export const IconRubric = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 2.3h6.2L13 5.1v8.6a.7.7 0 0 1-.7.7H4a.7.7 0 0 1-.7-.7V3a.7.7 0 0 1 .7-.7Z" />
    <path d="M9.9 2.4v2.9H13" />
    <path d="M5.8 8h4.4M5.8 10.6h3" />
  </Svg>
)

export const IconModel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.2 13 5v6l-5 2.8L3 11V5l5-2.8Z" />
    <path d="M8 8.1 13 5M8 8.1v5.7M8 8.1 3 5" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.9v1.6M8 12.5v1.6M2.6 8h1.6M11.8 8h1.6M4.2 4.2l1.1 1.1M10.7 10.7l1.1 1.1M11.8 4.2l-1.1 1.1M5.3 10.7l-1.1 1.1" />
  </Svg>
)

export const IconCaret = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.2 8 10l4-3.8" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </Svg>
)

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 4.4h10.4" />
    <path d="M6.2 4.4V3.1a.7.7 0 0 1 .7-.7h2.2a.7.7 0 0 1 .7.7v1.3" />
    <path d="M4.2 4.4l.6 8.5a.7.7 0 0 0 .7.6h5a.7.7 0 0 0 .7-.6l.6-8.5" />
    <path d="M6.8 7v4M9.2 7v4" />
  </Svg>
)

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1" />
    <path d="M10.4 3.2H3.9a.7.7 0 0 0-.7.7v6.5" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.2 8.4 6.4 11.6l6.4-6.4" />
  </Svg>
)

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5.2v3.6M8 10.9v.1" />
  </Svg>
)

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.4v3.4M8 5v.1" />
  </Svg>
)

export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.2 9.4 6l3.8 1.4L9.4 8.8 8 12.6 6.6 8.8 2.8 7.4 6.6 6 8 2.2Z" />
  </Svg>
)

export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.4 2.8h6.9l2.3 2.3v7.4a.7.7 0 0 1-.7.7H3.4a.7.7 0 0 1-.7-.7V3.5a.7.7 0 0 1 .7-.7Z" />
    <path d="M5.4 2.8v3.4h4.4V2.8M5.6 13.2V9.6h4.8v3.6" />
  </Svg>
)

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.6 8S4 3.9 8 3.9 14.4 8 14.4 8 12 12.1 8 12.1 1.6 8 1.6 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </Svg>
)

export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.4 2.8l2.8 2.8-8 8H2.4v-2.8l8-8Z" />
    <path d="M9.2 4l2.8 2.8" />
  </Svg>
)

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
    <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3L3.6 8.2a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.6v7.2" />
    <path d="M5.2 7.2 8 10l2.8-2.8" />
    <path d="M3 12.4h10" />
  </Svg>
)

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.2V3" />
    <path d="M5.2 5.8 8 3l2.8 2.8" />
    <path d="M3 12.4h10" />
  </Svg>
)

export const IconVocab = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.2 3.4h3.6a1.6 1.6 0 0 1 1.6 1.6v7.6a1.3 1.3 0 0 0-1.3-1.3H3.2V3.4Z" />
    <path d="M12.8 3.4H9.2a1.6 1.6 0 0 0-1.6 1.6" />
    <path d="M12.8 3.4v7.9H9.2" />
    <path d="M5.2 6h1.9M5.2 8.2h1.9M10.8 6h1.6" />
  </Svg>
)

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.6 5.6h2.1l.9-1.4h4.8l.9 1.4h2.1a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7H2.6a.7.7 0 0 1-.7-.7V6.3a.7.7 0 0 1 .7-.7Z" />
    <circle cx="8" cy="9.2" r="2.1" />
  </Svg>
)

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4.2C7 3.2 5.4 2.8 3 2.8v9.4c2.4 0 4 .4 5 1.4 1-1 2.6-1.4 5-1.4V2.8c-2.4 0-4 .4-5 1.4Z" />
    <path d="M8 4.2v9.4" />
  </Svg>
)
