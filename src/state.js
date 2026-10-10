// Datamodel og hjælpefunktioner for strikkeskabeloner

export const DEFAULT_PALETTE = [
  { hex: '#ffffff', name: 'Hvid' },
  { hex: '#1f2937', name: 'Mørkegrå' },
  { hex: '#e11d48', name: 'Rød' },
  { hex: '#2563eb', name: 'Blå' },
  { hex: '#16a34a', name: 'Grøn' },
  { hex: '#f59e0b', name: 'Gul' },
  { hex: '#7c3aed', name: 'Lilla' },
  { hex: '#f472b6', name: 'Pink' },
]

export const MAX_SIZE = 300

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/**
 * Kanter mellem felterne:
 *  hEdges[r*cols + c]      = vandret kant OVER felt (r,c), r = 0..rows (r = rows er underkanten)
 *  vEdges[r*(cols+1) + c]  = lodret kant til VENSTRE for felt (r,c), c = 0..cols (c = cols er højre kant)
 */
export function emptyEdges(cols, rows) {
  return {
    hEdges: new Array((rows + 1) * cols).fill(0),
    vEdges: new Array(rows * (cols + 1)).fill(0),
  }
}

export function hIdx(cols, r, c) {
  return r * cols + c
}
export function vIdx(cols, r, c) {
  return r * (cols + 1) + c
}

/**
 * Udleder hvilke felter der ligger indenfor en lukket kant.
 * Alt der kan nås fra gridets yderside uden at krydse en sort kant er "udenfor".
 * Er intet lukket inde, bruges hele gridet som skabelon (closed = false).
 */
export function shapeFromEdges(cols, rows, hEdges, vEdges) {
  const n = cols * rows
  const outside = new Uint8Array(n)
  const stack = []
  for (let c = 0; c < cols; c++) {
    if (!hEdges[hIdx(cols, 0, c)]) stack.push(c)
    if (!hEdges[hIdx(cols, rows, c)]) stack.push((rows - 1) * cols + c)
  }
  for (let r = 0; r < rows; r++) {
    if (!vEdges[vIdx(cols, r, 0)]) stack.push(r * cols)
    if (!vEdges[vIdx(cols, r, cols)]) stack.push(r * cols + cols - 1)
  }
  while (stack.length) {
    const i = stack.pop()
    if (outside[i]) continue
    outside[i] = 1
    const r = (i / cols) | 0
    const c = i % cols
    if (r > 0 && !hEdges[hIdx(cols, r, c)]) stack.push(i - cols)
    if (r < rows - 1 && !hEdges[hIdx(cols, r + 1, c)]) stack.push(i + cols)
    if (c > 0 && !vEdges[vIdx(cols, r, c)]) stack.push(i - 1)
    if (c < cols - 1 && !vEdges[vIdx(cols, r, c + 1)]) stack.push(i + 1)
  }
  const shape = new Array(n)
  let inside = 0
  for (let i = 0; i < n; i++) {
    shape[i] = outside[i] ? 0 : 1
    inside += shape[i]
  }
  if (inside === 0) return { shape: new Array(n).fill(1), closed: false, count: n }
  return { shape, closed: true, count: inside }
}

/** Kanter ud fra et felt-baseret udsnit (bruges ved import af ældre filer) */
export function edgesFromShape(cols, rows, shape) {
  const { hEdges, vEdges } = emptyEdges(cols, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!shape[i]) continue
      if (r === 0 || !shape[i - cols]) hEdges[hIdx(cols, r, c)] = 1
      if (r === rows - 1 || !shape[i + cols]) hEdges[hIdx(cols, r + 1, c)] = 1
      if (c === 0 || !shape[i - 1]) vEdges[vIdx(cols, r, c)] = 1
      if (c === cols - 1 || !shape[i + 1]) vEdges[vIdx(cols, r, c + 1)] = 1
    }
  }
  return { hEdges, vEdges }
}

export function newProject(name = 'Nyt projekt', cols = 40, rows = 60) {
  const n = cols * rows
  return {
    id: uid(),
    name,
    cols,
    rows,
    ...emptyEdges(cols, rows),
    shape: new Array(n).fill(1), // 1 = indenfor skabelonen (udledes af kanterne)
    colors: new Array(n).fill(null), // null = bundfarve (hvid)
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    recent: ['#2563eb', '#e11d48', '#1f2937', '#f59e0b', '#16a34a'],
    currentColor: '#2563eb',
    knit: {
      row: 0, // index i rækkelisten (0 = første række der strikkes)
      seg: 0,
      startFrom: 'bottom', // 'bottom' | 'top'
      direction: 'round', // 'round' | 'flat'
      firstSide: 'rtl', // første række læses højre→venstre
      speak: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function colorName(project, hex) {
  if (!hex) return 'Hvid'
  const p = project.palette.find((x) => x.hex.toLowerCase() === hex.toLowerCase())
  return p ? p.name : hex
}

export function resizeProject(project, cols, rows) {
  cols = Math.max(1, Math.min(MAX_SIZE, cols | 0))
  rows = Math.max(1, Math.min(MAX_SIZE, rows | 0))
  const colors = new Array(cols * rows).fill(null)
  const { hEdges, vEdges } = emptyEdges(cols, rows)
  for (let r = 0; r < Math.min(rows, project.rows); r++) {
    for (let c = 0; c < Math.min(cols, project.cols); c++) {
      colors[r * cols + c] = project.colors[r * project.cols + c]
    }
  }
  for (let r = 0; r <= Math.min(rows, project.rows); r++)
    for (let c = 0; c < Math.min(cols, project.cols); c++)
      hEdges[hIdx(cols, r, c)] = project.hEdges[hIdx(project.cols, r, c)]
  for (let r = 0; r < Math.min(rows, project.rows); r++)
    for (let c = 0; c <= Math.min(cols, project.cols); c++)
      vEdges[vIdx(cols, r, c)] = project.vEdges[vIdx(project.cols, r, c)]
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  return { ...project, cols, rows, shape, colors, hEdges, vEdges }
}

export function floodFill(project, r, c, newColor) {
  const { cols, rows, shape, colors } = project
  const start = r * cols + c
  if (!shape[start]) return project
  const target = colors[start]
  if ((target || null) === (newColor || null)) return project
  const next = colors.slice()
  const stack = [start]
  const seen = new Uint8Array(cols * rows)
  while (stack.length) {
    const i = stack.pop()
    if (seen[i]) continue
    seen[i] = 1
    if (!shape[i] || (colors[i] || null) !== (target || null)) continue
    next[i] = newColor
    const rr = (i / cols) | 0
    const cc = i % cols
    if (cc > 0) stack.push(i - 1)
    if (cc < cols - 1) stack.push(i + 1)
    if (rr > 0) stack.push(i - cols)
    if (rr < rows - 1) stack.push(i + cols)
  }
  return { ...project, colors: next }
}

export function cellsOnLine(r0, c0, r1, c1) {
  // Bresenham så hurtige museture ikke efterlader huller
  const out = []
  let dr = Math.abs(r1 - r0)
  let dc = Math.abs(c1 - c0)
  const sr = r0 < r1 ? 1 : -1
  const sc = c0 < c1 ? 1 : -1
  let err = dc - dr
  let r = r0
  let c = c0
  for (;;) {
    out.push([r, c])
    if (r === r1 && c === c1) break
    const e2 = 2 * err
    if (e2 > -dr) {
      err -= dr
      c += sc
    }
    if (e2 < dc) {
      err += dc
      r += sr
    }
  }
  return out
}

/** Rækker (grid-indeks) der indeholder mindst én celle i skabelonen, i strikkerækkefølge */
export function knitRowList(project) {
  const rows = []
  for (let r = 0; r < project.rows; r++) {
    for (let c = 0; c < project.cols; c++) {
      if (project.shape[r * project.cols + c]) {
        rows.push(r)
        break
      }
    }
  }
  if (project.knit.startFrom === 'bottom') rows.reverse()
  return rows
}

/** Læseretning for række nr. i (0-baseret) i strikkerækkefølgen */
export function rowDirection(project, i) {
  const { direction, firstSide } = project.knit
  const first = firstSide || 'rtl'
  if (direction === 'round') return first
  const other = first === 'rtl' ? 'ltr' : 'rtl'
  return i % 2 === 0 ? first : other
}

/** Segmenter (sammenhængende masker af samme farve) for en grid-række */
export function rowSegments(project, gridRow, dir) {
  const { cols, shape, colors } = project
  const segs = []
  const order = []
  for (let c = 0; c < cols; c++) order.push(c)
  if (dir === 'rtl') order.reverse()
  let cur = null
  for (const c of order) {
    const i = gridRow * cols + c
    const inside = !!shape[i]
    const color = inside ? colors[i] || null : undefined
    if (cur && cur.inside === inside && cur.color === color) {
      cur.count++
      cur.cols.push(c)
    } else {
      cur = { inside, color, count: 1, cols: [c] }
      segs.push(cur)
    }
  }
  // fjern mellemrum i start/slut
  while (segs.length && !segs[0].inside) segs.shift()
  while (segs.length && !segs[segs.length - 1].inside) segs.pop()
  return segs
}

export function stitchesInRow(project, gridRow) {
  let n = 0
  for (let c = 0; c < project.cols; c++) if (project.shape[gridRow * project.cols + c]) n++
  return n
}

export function segmentText(project, seg) {
  if (!seg.inside) return `spring ${seg.count} over`
  return `${seg.count} ${colorName(project, seg.color)}`
}

export function rowText(project, segs) {
  return segs.map((s) => segmentText(project, s)).join(', ')
}

export function pushRecent(recent, hex) {
  const r = [hex, ...recent.filter((x) => x !== hex)]
  return r.slice(0, 5)
}
