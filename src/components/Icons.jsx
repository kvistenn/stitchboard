// Små inline-ikoner (stroke-baserede, 20px)
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const Pen = (p) => (
  <svg {...base} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
export const Eraser = (p) => (
  <svg {...base} {...p}>
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
)
export const Rect = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
  </svg>
)
export const Bucket = (p) => (
  <svg {...base} {...p}>
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
    <path d="m5 2 5 5" />
    <path d="M2 13h15" />
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
  </svg>
)
export const Select = (p) => (
  <svg {...base} {...p}>
    <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />
    <path d="m10 10 7 3-3 1-1 3Z" />
  </svg>
)
export const Hand = (p) => (
  <svg {...base} {...p}>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v2" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.2 16a2 2 0 0 1 2.9-2.8L8 15" />
  </svg>
)
export const Undo = (p) => (
  <svg {...base} {...p}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
)
export const Redo = (p) => (
  <svg {...base} {...p}>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
  </svg>
)
export const Plus = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const Minus = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
)
export const ChevronLeft = (p) => (
  <svg {...base} {...p}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
export const ChevronRight = (p) => (
  <svg {...base} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)
export const ChevronUp = (p) => (
  <svg {...base} {...p}>
    <path d="m18 15-6-6-6 6" />
  </svg>
)
export const ChevronDown = (p) => (
  <svg {...base} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const Speaker = (p) => (
  <svg {...base} {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a9 9 0 0 1 0 14" />
  </svg>
)
export const SpeakerOff = (p) => (
  <svg {...base} {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="m22 9-6 6M16 9l6 6" />
  </svg>
)
export const Trash = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)
export const Download = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
)
export const Upload = (p) => (
  <svg {...base} {...p}>
    <path d="M12 15V3M7 8l5-5 5 5M4 21h16" />
  </svg>
)
export const Image = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)
export const Back = (p) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
export const Check = (p) => (
  <svg {...base} {...p}>
    <path d="m20 6-11 11-5-5" />
  </svg>
)
export const Yarn = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 9.5c5 0 8 2 11 6M5 16c3-1 6-1 10 2M8 4c2 3 3 6 3 10M14 3.5c-1 4 0 8 4 12" />
  </svg>
)
export const Copy = (p) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
export const Grid = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
)
export const Reset = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)
export const Border = (p) => (
  <svg {...base} {...p}>
    <path d="M4 4h16v16H4z" strokeDasharray="2 3" opacity=".45" />
    <path d="M9 4v16M15 4v16M4 9h16M4 15h16" opacity=".25" strokeWidth="1.5" />
    <path d="M9 9h6v6H9z" strokeWidth="2.6" />
  </svg>
)
