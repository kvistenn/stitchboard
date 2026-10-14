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

/** Kanterne rundt om rektanglet af felter r0..r1, c0..c1 (hjørnerne må komme i vilkårlig rækkefølge) */
export function rectEdges(r0, c0, r1, c1) {
  const top = Math.min(r0, r1)
  const bottom = Math.max(r0, r1)
  const left = Math.min(c0, c1)
  const right = Math.max(c0, c1)
  const edges = []
  for (let c = left; c <= right; c++) edges.push({ type: 'h', r: top, c }, { type: 'h', r: bottom + 1, c })
  for (let r = top; r <= bottom; r++) edges.push({ type: 'v', r, c: left }, { type: 'v', r, c: right + 1 })
  return edges
}

/**
 * Kanten fra gitterhjørnet [r,c] ét skridt i retningen [dr,dc] og hjørnet man ender i.
 * null hvis skridtet går udenfor gridet (hjørner går fra 0..rows og 0..cols).
 */
export function edgeStep(cols, rows, corner, dr, dc) {
  const r = corner[0] + dr
  const c = corner[1] + dc
  if (r < 0 || c < 0 || r > rows || c > cols) return null
  const edge = dr ? { type: 'v', r: Math.min(r, corner[0]), c } : { type: 'h', r, c: Math.min(c, corner[1]) }
  return { edge, corner: [r, c] }
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
    colors: new Array(n).fill(null), // AFLEDT: synlige lag lagt sammen – skrives kun via setLayers. null = hvid bund
    layers: [{ id: uid(), name: 'Lag 1', visible: true, colors: new Array(n).fill(null) }], // nederste først; null = gennemsigtig
    notes: [], // post-it-noter på lærredet: { id, r, c, text } – r/c er gitterfeltet for notens øverste venstre hjørne
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    recent: ['#2563eb', '#e11d48', '#1f2937', '#f59e0b', '#16a34a'],
    currentColor: '#2563eb',
    knit: {
      row: 0, // index i rækkelisten (0 = første række der strikkes)
      seg: 0,
      startFrom: 'bottom', // 'bottom' | 'top'
      direction: 'round', // 'round' | 'flat'
      firstSide: 'rtl', // første række læses højre→venstre
      stepBySegment: false, // true = gå frem ét farveskift ad gangen i stedet for hele rækken
      focus: [], // nøgler (se findTemplates) på de skabeloner der strikkes; tom = den første
      sync: true, // flere skabeloner følges synkront – række 1 i hver skabelon hører sammen
      speak: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ---- lag ---------------------------------------------------------------
// layers: nederste lag først. I et lag er null gennemsigtig. project.colors er altid
// sammenlægningen af de synlige lag og må kun skrives via setLayers.

export function newLayer(name, n) {
  return { id: uid(), name, visible: true, colors: new Array(n).fill(null) }
}

/** Øverste synlige farve i felt i (null = hvid bund) */
export function flattenCell(layers, i) {
  for (let k = layers.length - 1; k >= 0; k--) {
    const l = layers[k]
    if (l.visible && l.colors[i]) return l.colors[i]
  }
  return null
}

export function flattenLayers(layers, n) {
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = flattenCell(layers, i)
  return out
}

export function setLayers(project, layers) {
  return { ...project, layers, colors: flattenLayers(layers, project.cols * project.rows) }
}

export function setLayerColors(project, index, colors) {
  return setLayers(project, project.layers.map((l, k) => (k === index ? { ...l, colors } : l)))
}

/** Har projektet brugbare lag (mindst ét, alle i lærredets størrelse)? */
export function hasValidLayers(project) {
  const n = project.cols * project.rows
  return (
    Array.isArray(project.layers) &&
    project.layers.length > 0 &&
    project.layers.every((l) => Array.isArray(l?.colors) && l.colors.length === n)
  )
}

/** Indekset for laget med dette id – ellers det øverste lag */
export function layerIndexById(layers, id) {
  const k = layers.findIndex((l) => l.id === id)
  return k >= 0 ? k : layers.length - 1
}

/** Gamle projekter (uden lag) bliver til ét lag; ødelagte lag repareres */
export function ensureLayers(project) {
  const n = project.cols * project.rows
  if (hasValidLayers(project)) {
    const layers = project.layers.map((l, k) => ({
      id: l.id || uid(),
      name: l.name || `Lag ${k + 1}`,
      visible: l.visible !== false,
      colors: l.colors,
    }))
    return setLayers(project, layers)
  }
  const colors =
    Array.isArray(project.colors) && project.colors.length === n ? project.colors.slice() : new Array(n).fill(null)
  return setLayers(project, [{ ...newLayer('Lag 1', n), colors }])
}

function nextLayerName(layers) {
  const used = new Set(layers.map((l) => l.name))
  let k = 1
  while (used.has(`Lag ${k}`)) k++
  return `Lag ${k}`
}

export function addLayer(project, index) {
  const layers = project.layers.slice()
  layers.splice(index + 1, 0, newLayer(nextLayerName(layers), project.cols * project.rows))
  return setLayers(project, layers)
}

export function duplicateLayer(project, index) {
  const src = project.layers[index]
  const layers = project.layers.slice()
  layers.splice(index + 1, 0, { ...src, id: uid(), name: `${src.name} (kopi)`, colors: src.colors.slice() })
  return setLayers(project, layers)
}

export function removeLayer(project, index) {
  if (project.layers.length <= 1) return project
  return setLayers(project, project.layers.filter((_, k) => k !== index))
}

export function moveLayerOrder(project, index, delta) {
  const to = index + delta
  if (to < 0 || to >= project.layers.length) return project
  const layers = project.layers.slice()
  const [l] = layers.splice(index, 1)
  layers.splice(to, 0, l)
  return setLayers(project, layers)
}

export function toggleLayer(project, index) {
  return setLayers(project, project.layers.map((l, k) => (k === index ? { ...l, visible: !l.visible } : l)))
}

export function renameLayer(project, index, name) {
  const n = name.trim()
  if (!n) return project
  return { ...project, layers: project.layers.map((l, k) => (k === index ? { ...l, name: n } : l)) }
}

export function paintCells(project, index, cells, value) {
  const colors = project.layers[index].colors.slice()
  for (const [r, c] of cells) colors[r * project.cols + c] = value
  return setLayerColors(project, index, colors)
}

export function clearLayer(project, index) {
  return setLayerColors(project, index, new Array(project.cols * project.rows).fill(null))
}

/** Omkredsen af et lags indhold, eller null hvis laget er tomt */
export function layerBounds(colors, cols) {
  let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1
  for (let i = 0; i < colors.length; i++) {
    if (!colors[i]) continue
    const r = (i / cols) | 0
    const c = i % cols
    if (r < r0) r0 = r
    if (r > r1) r1 = r
    if (c < c0) c0 = c
    if (c > c1) c1 = c
  }
  return r1 < 0 ? null : { r0, c0, r1, c1 }
}

/** Flytter hele lagets indhold dr/dc felter – holdt indenfor gridet, så intet falder af */
export function shiftLayer(project, index, dr, dc) {
  const { cols, rows } = project
  const src = project.layers[index].colors
  const b = layerBounds(src, cols)
  if (!b) return project
  dr = Math.max(-b.r0, Math.min(rows - 1 - b.r1, dr))
  dc = Math.max(-b.c0, Math.min(cols - 1 - b.c1, dc))
  if (!dr && !dc) return project
  const colors = new Array(cols * rows).fill(null)
  for (let i = 0; i < src.length; i++) {
    if (!src[i]) continue
    colors[(((i / cols) | 0) + dr) * cols + (i % cols) + dc] = src[i]
  }
  return setLayerColors(project, index, colors)
}

export function colorName(project, hex) {
  if (!hex) return 'Hvid'
  const p = project.palette.find((x) => x.hex.toLowerCase() === hex.toLowerCase())
  return p ? p.name : hex
}

/**
 * Hvor meget det gamle indhold skal flyttes når lærredet får ny størrelse.
 * ax/ay er ankeret: 0 = venstre/top bliver stående, 1 = midten, 2 = højre/bund.
 */
export function resizeOffset(project, cols, rows, ax = 0, ay = 0) {
  return { dr: Math.floor(((rows - project.rows) * ay) / 2), dc: Math.floor(((cols - project.cols) * ax) / 2) }
}

// ny størrelse holdes indenfor 1..MAX_SIZE
const clampSize = (n) => Math.max(1, Math.min(MAX_SIZE, n | 0))

/**
 * Det der forsvinder hvis lærredet får størrelsen cols×rows og indholdet flyttes dr/dc:
 * felter med farve (på et hvilket som helst lag), kanter og noter der skubbes ind fra kanten.
 */
export function resizeLoss(project, cols, rows, dr = 0, dc = 0) {
  cols = clampSize(cols)
  rows = clampSize(rows)
  const out = (r, c, maxR, maxC) => r + dr < 0 || c + dc < 0 || r + dr > maxR || c + dc > maxC
  let cells = 0
  for (let i = 0; i < project.cols * project.rows; i++)
    if (out((i / project.cols) | 0, i % project.cols, rows - 1, cols - 1) && project.layers.some((l) => l.colors[i]))
      cells++
  let edges = 0
  for (let r = 0; r <= project.rows; r++)
    for (let c = 0; c < project.cols; c++)
      if (project.hEdges[hIdx(project.cols, r, c)] && out(r, c, rows, cols - 1)) edges++
  for (let r = 0; r < project.rows; r++)
    for (let c = 0; c <= project.cols; c++)
      if (project.vEdges[vIdx(project.cols, r, c)] && out(r, c, rows - 1, cols)) edges++
  const notes = (project.notes || []).filter((n) => out(n.r, n.c, rows - 1, cols - 1)).length
  return { cells, edges, notes }
}

/** Ny størrelse på lærredet. Det gamle indhold flyttes dr/dc felter (se resizeOffset); det der falder udenfor forsvinder. */
export function resizeProject(project, cols, rows, dr = 0, dc = 0) {
  cols = clampSize(cols)
  rows = clampSize(rows)
  const { hEdges, vEdges } = emptyEdges(cols, rows)
  const inside = (r, c, maxR, maxC) => r >= 0 && c >= 0 && r <= maxR && c <= maxC
  const layers = project.layers.map((l) => {
    const colors = new Array(cols * rows).fill(null)
    for (let r = 0; r < project.rows; r++)
      for (let c = 0; c < project.cols; c++)
        if (inside(r + dr, c + dc, rows - 1, cols - 1)) colors[(r + dr) * cols + c + dc] = l.colors[r * project.cols + c]
    return { ...l, colors }
  })
  for (let r = 0; r <= project.rows; r++)
    for (let c = 0; c < project.cols; c++)
      if (inside(r + dr, c + dc, rows, cols - 1))
        hEdges[hIdx(cols, r + dr, c + dc)] = project.hEdges[hIdx(project.cols, r, c)]
  for (let r = 0; r < project.rows; r++)
    for (let c = 0; c <= project.cols; c++)
      if (inside(r + dr, c + dc, rows - 1, cols))
        vEdges[vIdx(cols, r + dr, c + dc)] = project.vEdges[vIdx(project.cols, r, c)]
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  const notes = (project.notes || []).map((n) => clampNote({ ...n, r: n.r + dr, c: n.c + dc }, cols, rows))
  // skabelonernes nøgler er feltnumre, så de valgte skabeloner i strikkevisningen skal regnes om
  const focus = (project.knit?.focus || []).flatMap((k) => {
    const r = ((k / project.cols) | 0) + dr
    const c = (k % project.cols) + dc
    return inside(r, c, rows - 1, cols - 1) ? [r * cols + c] : []
  })
  const knit = project.knit && { ...project.knit, focus }
  return setLayers({ ...project, cols, rows, shape, hEdges, vEdges, notes, knit }, layers)
}

// ---- noter -------------------------------------------------------------
// projekter gemt før noterne fandtes har ikke feltet, derfor `|| []`

function clampNote(note, cols, rows) {
  return { ...note, r: Math.max(0, Math.min(rows - 1, note.r)), c: Math.max(0, Math.min(cols - 1, note.c)) }
}

export function addNote(project, note) {
  return { ...project, notes: [...(project.notes || []), clampNote(note, project.cols, project.rows)] }
}

export function updateNote(project, id, patch) {
  const notes = (project.notes || []).map((n) =>
    n.id === id ? clampNote({ ...n, ...patch }, project.cols, project.rows) : n,
  )
  return { ...project, notes }
}

export function removeNote(project, id) {
  return { ...project, notes: (project.notes || []).filter((n) => n.id !== id) }
}

/** Området findes ud fra det man ser (sammenlægningen), men der fyldes kun på lag `index` */
export function floodFill(project, r, c, newColor, index) {
  const { cols, rows, shape, colors } = project
  const start = r * cols + c
  // spanden bliver på sin side af kanten: indenfor skabelonen eller udenfor (mønster-kladde)
  const side = shape[start]
  const target = colors[start]
  if ((target || null) === (newColor || null)) return project
  const next = project.layers[index].colors.slice()
  const stack = [start]
  const seen = new Uint8Array(cols * rows)
  while (stack.length) {
    const i = stack.pop()
    if (seen[i]) continue
    seen[i] = 1
    if (shape[i] !== side || (colors[i] || null) !== (target || null)) continue
    next[i] = newColor
    const rr = (i / cols) | 0
    const cc = i % cols
    if (cc > 0) stack.push(i - 1)
    if (cc < cols - 1) stack.push(i + 1)
    if (rr > 0) stack.push(i - cols)
    if (rr < rows - 1) stack.push(i + cols)
  }
  return setLayerColors(project, index, next)
}

/**
 * Flytter farverne i en markering (sel = {r0,c0,r1,c1}, normaliseret) på lag `index` dr/dc felter.
 * Gælder både felter i og udenfor skabelonen, så et mønster tegnet ved siden af kan trækkes ind.
 */
export function moveCells(project, sel, dr, dc, index) {
  const { cols, rows } = project
  const src = project.layers[index].colors
  const next = src.slice()
  for (let r = sel.r0; r <= sel.r1; r++)
    for (let c = sel.c0; c <= sel.c1; c++) next[r * cols + c] = null
  for (let r = sel.r0; r <= sel.r1; r++)
    for (let c = sel.c0; c <= sel.c1; c++) {
      const tr = r + dr
      const tc = c + dc
      if (tr < 0 || tc < 0 || tr >= rows || tc >= cols) continue
      next[tr * cols + tc] = src[r * cols + c]
    }
  return setLayerColors(project, index, next)
}

/**
 * Skabelon-tilstand: kopierer alt i en markering (sel, normaliseret) – kanter rundt om og mellem felterne,
 * farver på alle lag og noter, alt relativt til markeringens øverste venstre hjørne.
 */
export function copyArea(project, sel) {
  const { cols } = project
  const { r0, c0, r1, c1 } = sel
  const w = c1 - c0 + 1
  const h = r1 - r0 + 1
  const hEdges = []
  for (let r = r0; r <= r1 + 1; r++) for (let c = c0; c <= c1; c++) hEdges.push(project.hEdges[hIdx(cols, r, c)])
  const vEdges = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1 + 1; c++) vEdges.push(project.vEdges[vIdx(cols, r, c)])
  const layers = project.layers.map((l) => {
    const colors = []
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) colors.push(l.colors[r * cols + c])
    return colors
  })
  const notes = (project.notes || [])
    .filter((n) => n.r >= r0 && n.r <= r1 && n.c >= c0 && n.c <= c1)
    .map((n) => ({ ...n, r: n.r - r0, c: n.c - c0 }))
  return { kind: 'area', r0, c0, w, h, hEdges, vEdges, layers, notes }
}

/**
 * Skriver et kopieret område (copyArea) ind med øverste venstre hjørne i (r0,c0). Indholdet overskrives,
 * men en kant i yderkanten bevares, så en nabo-skabelon ikke åbnes. Noter håndteres af kalderen.
 */
function writeArea(project, clip, r0, c0) {
  const { cols, rows } = project
  let p = project
  while (p.layers.length < clip.layers.length) p = addLayer(p, p.layers.length - 1)
  const hEdges = p.hEdges.slice()
  const vEdges = p.vEdges.slice()
  for (let r = 0; r <= clip.h; r++)
    for (let c = 0; c < clip.w; c++) {
      const tr = r0 + r
      const tc = c0 + c
      if (tr < 0 || tr > rows || tc < 0 || tc >= cols) continue
      const v = clip.hEdges[r * clip.w + c]
      const idx = hIdx(cols, tr, tc)
      hEdges[idx] = r === 0 || r === clip.h ? hEdges[idx] || v : v
    }
  for (let r = 0; r < clip.h; r++)
    for (let c = 0; c <= clip.w; c++) {
      const tr = r0 + r
      const tc = c0 + c
      if (tr < 0 || tr >= rows || tc < 0 || tc > cols) continue
      const v = clip.vEdges[r * (clip.w + 1) + c]
      const idx = vIdx(cols, tr, tc)
      vEdges[idx] = c === 0 || c === clip.w ? vEdges[idx] || v : v
    }
  const layers = p.layers.map((l, k) => {
    if (k >= clip.layers.length) return l
    const colors = l.colors.slice()
    for (let r = 0; r < clip.h; r++)
      for (let c = 0; c < clip.w; c++) {
        const tr = r0 + r
        const tc = c0 + c
        if (tr < 0 || tc < 0 || tr >= rows || tc >= cols) continue
        colors[tr * cols + tc] = clip.layers[k][r * clip.w + c]
      }
    return { ...l, colors }
  })
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  return setLayers({ ...p, hEdges, vEdges, shape }, layers)
}

/**
 * Indsætter et kopieret område med øverste venstre hjørne i (r0,c0) – skubbet ind så det holder sig i gridet.
 * Noterne bliver nye kopier. Returnerer det nye projekt og den indsatte markering.
 */
export function pasteArea(project, clip, r0, c0) {
  const { cols, rows } = project
  r0 = Math.max(0, Math.min(rows - clip.h, r0))
  c0 = Math.max(0, Math.min(cols - clip.w, c0))
  const next = writeArea(project, clip, r0, c0)
  const added = clip.notes.map((n) => clampNote({ ...n, id: uid(), r: r0 + n.r, c: c0 + n.c }, cols, rows))
  const sel = { r0, c0, r1: Math.min(rows, r0 + clip.h) - 1, c1: Math.min(cols, c0 + clip.w) - 1 }
  return { project: { ...next, notes: [...(project.notes || []), ...added] }, sel }
}

/**
 * Skabelon-tilstand: flytter alt i en markering (sel, normaliseret) dr/dc felter – kanter, farver på
 * alle lag og noter. Klipper markeringen en skabelon over, åbnes den (opløses) indtil delene samles igen.
 * Kanter i markeringens yderkant, som en anden skabelon udenfor deler, bliver stående, så naboen ikke åbnes.
 * På den nye plads overskrives indholdet, men en kant i yderkanten bevares, så naboer ikke åbnes dér heller.
 */
export function moveRegion(project, templates, sel, dr, dc) {
  const { cols, rows } = project
  const { r0, c0, r1, c1 } = sel
  const clip = copyArea(project, sel)
  // skabeloner der har felter i markeringen – dem klipper vi i
  const cut = new Set()
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const k = templates.comp[r * cols + c]
      if (k >= 0) cut.add(k)
    }
  // en kant i yderkanten bevares hvis feltet udenfor hører til en skabelon vi ikke klipper i
  const neighbour = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    const k = templates.comp[r * cols + c]
    return k >= 0 && !cut.has(k)
  }
  const hEdges = project.hEdges.slice()
  const vEdges = project.vEdges.slice()
  for (let r = r0; r <= r1 + 1; r++)
    for (let c = c0; c <= c1; c++) {
      const outer = r === r0 ? [r - 1, c] : r === r1 + 1 ? [r, c] : null
      if (!outer || !neighbour(...outer)) hEdges[hIdx(cols, r, c)] = 0
    }
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1 + 1; c++) {
      const outer = c === c0 ? [r, c - 1] : c === c1 + 1 ? [r, c] : null
      if (!outer || !neighbour(...outer)) vEdges[vIdx(cols, r, c)] = 0
    }
  const layers = project.layers.map((l) => {
    const colors = l.colors.slice()
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) colors[r * cols + c] = null
    return { ...l, colors }
  })
  const cleared = setLayers({ ...project, hEdges, vEdges }, layers)
  const next = writeArea(cleared, clip, r0 + dr, c0 + dc)
  const notes = (project.notes || []).map((n) =>
    n.r >= r0 && n.r <= r1 && n.c >= c0 && n.c <= c1 ? clampNote({ ...n, r: n.r + dr, c: n.c + dc }, cols, rows) : n,
  )
  return { ...next, notes }
}

/**
 * Optælling i et område (sel, normaliseret): rækker og masker i rammen, og hvor mange af felterne
 * der ligger indenfor skabelonen – samlet og fordelt på farver (null = hvid).
 */
export function countRegion(project, sel) {
  const { cols, shape, colors } = project
  const rowsInside = new Set()
  const colsInside = new Set()
  const byColor = new Map()
  let inside = 0
  for (let r = sel.r0; r <= sel.r1; r++)
    for (let c = sel.c0; c <= sel.c1; c++) {
      const i = r * cols + c
      if (!shape[i]) continue
      inside++
      rowsInside.add(r)
      colsInside.add(c)
      const col = colors[i] || null
      byColor.set(col, (byColor.get(col) || 0) + 1)
    }
  return {
    rows: sel.r1 - sel.r0 + 1,
    stitches: sel.c1 - sel.c0 + 1,
    inside,
    rowsInside: rowsInside.size,
    stitchesInside: colsInside.size,
    colors: [...byColor].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count),
  }
}

/** Kopierer farverne i en markering (normaliseret) på lag `index` til en udklipsholder */
export function copyRegion(project, sel, index) {
  const { cols } = project
  const w = sel.c1 - sel.c0 + 1
  const h = sel.r1 - sel.r0 + 1
  const colors = []
  for (let r = sel.r0; r <= sel.r1; r++)
    for (let c = sel.c0; c <= sel.c1; c++) colors.push(project.layers[index].colors[r * cols + c])
  return { kind: 'pattern', r0: sel.r0, c0: sel.c0, w, h, colors }
}

/**
 * Indsætter en kopi med øverste venstre hjørne i (r0,c0) – skubbet ind så den holder sig i gridet.
 * Hvide felter i kopien er gennemsigtige. Returnerer det nye projekt og den indsatte markering.
 */
export function pasteRegion(project, clip, r0, c0, index) {
  const { cols, rows } = project
  r0 = Math.max(0, Math.min(rows - clip.h, r0))
  c0 = Math.max(0, Math.min(cols - clip.w, c0))
  const colors = project.layers[index].colors.slice()
  for (let r = 0; r < clip.h; r++)
    for (let c = 0; c < clip.w; c++) {
      const v = clip.colors[r * clip.w + c]
      const tr = r0 + r
      const tc = c0 + c
      if (!v || tr >= rows || tc >= cols) continue
      colors[tr * cols + tc] = v
    }
  const sel = { r0, c0, r1: Math.min(rows, r0 + clip.h) - 1, c1: Math.min(cols, c0 + clip.w) - 1 }
  return { project: setLayerColors(project, index, colors), sel }
}

/**
 * Indsætter et mønster fra et regneark (se parseSheetHTML) med øverste venstre hjørne i (r0,c0) på lag `index`.
 * Lærredet gøres større hvis mønsteret ikke kan være der (op til MAX_SIZE). Farver der ikke er i paletten
 * oprettes, og tekst i en celle bliver en note i feltet (en note der allerede står i feltet erstattes).
 * Tomme celler er gennemsigtige. Returnerer det nye projekt og den indsatte markering.
 */
export function pasteSheet(project, sheet, r0, c0, index) {
  let p = project
  const cols = Math.min(MAX_SIZE, Math.max(p.cols, c0 + sheet.w))
  const rows = Math.min(MAX_SIZE, Math.max(p.rows, r0 + sheet.h))
  if (cols !== p.cols || rows !== p.rows) p = resizeProject(p, cols, rows)
  r0 = Math.max(0, Math.min(rows - sheet.h, r0))
  c0 = Math.max(0, Math.min(cols - sheet.w, c0))
  const inside = (cell) => r0 + cell.r < rows && c0 + cell.c < cols
  const cells = sheet.cells.filter(inside)

  const palette = p.palette.slice()
  const known = new Set(palette.map((x) => x.hex.toLowerCase()))
  const added = []
  let n = 1
  for (const { color } of cells) {
    if (!color || known.has(color)) continue
    known.add(color)
    while (palette.some((x) => x.name === `Farve ${n}`)) n++
    palette.push({ hex: color, name: `Farve ${n}` })
    added.push(color)
  }
  let recent = p.recent
  for (const hex of added.slice(0, 5).reverse()) recent = pushRecent(recent, hex)

  const colors = p.layers[index].colors.slice()
  for (const cell of cells) if (cell.color) colors[(r0 + cell.r) * cols + c0 + cell.c] = cell.color
  p = setLayerColors({ ...p, palette, recent }, index, colors)

  const texts = cells.filter((cell) => cell.text)
  const at = new Set(texts.map((cell) => `${r0 + cell.r},${c0 + cell.c}`))
  const notes = [
    ...(p.notes || []).filter((x) => !at.has(`${x.r},${x.c}`)),
    ...texts.map((cell) => ({ id: uid(), r: r0 + cell.r, c: c0 + cell.c, text: cell.text })),
  ]
  const sel = { r0, c0, r1: Math.min(rows, r0 + sheet.h) - 1, c1: Math.min(cols, c0 + sheet.w) - 1 }
  return { project: { ...p, notes }, sel }
}

/** Kopierer en hel skabelon: felter, farver (pr. lag) og kanterne rundt om hvert felt (relativt til r0/c0) */
export function copyTemplate(project, t) {
  const { cols } = project
  const cells = []
  const hEdges = []
  const vEdges = []
  for (const i of t.cells) {
    const r = (i / cols) | 0
    const c = i % cols
    cells.push({ r: r - t.r0, c: c - t.c0, colors: project.layers.map((l) => l.colors[i]) })
    for (const er of [r, r + 1]) if (project.hEdges[hIdx(cols, er, c)]) hEdges.push({ r: er - t.r0, c: c - t.c0 })
    for (const ec of [c, c + 1]) if (project.vEdges[vIdx(cols, r, ec)]) vEdges.push({ r: r - t.r0, c: ec - t.c0 })
  }
  return { kind: 'template', r0: t.r0, c0: t.c0, w: t.c1 - t.c0 + 1, h: t.r1 - t.r0 + 1, cells, hEdges, vEdges }
}

/**
 * Plads til en kopi af en skabelon: til højre for originalen med 2 felters mellemrum, ellers nedenunder.
 * Pladsen (plus én felts kant rundt om) må ikke røre en anden skabelon. null = ingen plads.
 */
export function findTemplateSpot(project, clip) {
  const { cols, rows, shape } = project
  const free = (r0, c0) => {
    if (r0 + clip.h > rows || c0 + clip.w > cols) return false
    for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r0 + clip.h); r++)
      for (let c = Math.max(0, c0 - 1); c <= Math.min(cols - 1, c0 + clip.w); c++) if (shape[r * cols + c]) return false
    return true
  }
  for (const [r, c] of [
    [clip.r0, clip.c0 + clip.w + 2],
    [clip.r0 + clip.h + 2, clip.c0],
  ])
    if (free(r, c)) return [r, c]
  return null
}

/** Indsætter en kopieret skabelon med øverste venstre hjørne i (r0,c0); mangler der lag, oprettes de */
export function pasteTemplate(project, clip, r0, c0) {
  const { cols, rows } = project
  let p = project
  const need = clip.cells.length ? clip.cells[0].colors.length : 0
  while (p.layers.length < need) p = addLayer(p, p.layers.length - 1)
  const hEdges = p.hEdges.slice()
  const vEdges = p.vEdges.slice()
  for (const e of clip.hEdges) hEdges[hIdx(cols, r0 + e.r, c0 + e.c)] = 1
  for (const e of clip.vEdges) vEdges[vIdx(cols, r0 + e.r, c0 + e.c)] = 1
  const layers = p.layers.map((l, k) => {
    if (k >= need) return l
    const colors = l.colors.slice()
    for (const cell of clip.cells) colors[(r0 + cell.r) * cols + c0 + cell.c] = cell.colors[k]
    return { ...l, colors }
  })
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  return setLayers({ ...p, hEdges, vEdges, shape }, layers)
}

/**
 * Sletter en hel skabelon: kanterne rundt om og i den, farver på alle lag og noter i dens felter.
 * Kanter der deles med en anden skabelon bliver stående, så naboen ikke åbnes.
 */
export function deleteTemplate(project, templates, t) {
  const { cols, rows } = project
  const { comp } = templates
  const hEdges = project.hEdges.slice()
  const vEdges = project.vEdges.slice()
  const other = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    const k = comp[r * cols + c]
    return k >= 0 && k !== t.index
  }
  for (const i of t.cells) {
    const r = (i / cols) | 0
    const c = i % cols
    if (!other(r - 1, c)) hEdges[hIdx(cols, r, c)] = 0
    if (!other(r + 1, c)) hEdges[hIdx(cols, r + 1, c)] = 0
    if (!other(r, c - 1)) vEdges[vIdx(cols, r, c)] = 0
    if (!other(r, c + 1)) vEdges[vIdx(cols, r, c + 1)] = 0
  }
  const inside = new Set(t.cells)
  const layers = project.layers.map((l) => {
    const colors = l.colors.slice()
    for (const i of t.cells) colors[i] = null
    return { ...l, colors }
  })
  const notes = (project.notes || []).filter((n) => !inside.has(n.r * cols + n.c))
  const knit = project.knit && { ...project.knit, focus: (project.knit.focus || []).filter((k) => k !== t.key) }
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  return setLayers({ ...project, hEdges, vEdges, shape, notes, knit }, layers)
}

/** Beskærer mønsteret til skabelonen: alt udenfor (kladde) slettes – på alle lag */
export function cropToTemplate(project) {
  const layers = project.layers.map((l) => ({ ...l, colors: l.colors.map((col, i) => (project.shape[i] ? col : null)) }))
  return setLayers(project, layers)
}

/** Er der kladde udenfor skabelonen på noget lag (også skjulte)? */
export function hasDraftOutside(project) {
  return project.layers.some((l) => l.colors.some((col, i) => col && !project.shape[i]))
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

/**
 * Finder de enkelte skabeloner på lærredet: sammenhængende felter indenfor kanten,
 * hvor man ikke krydser en sort kant. key = første felts indeks (læseretning) og bruges
 * til at huske hvilke skabeloner der er valgt i strik-tilstand.
 */
export function findTemplates(project) {
  const { cols, rows, shape, hEdges, vEdges } = project
  const n = cols * rows
  const comp = new Int32Array(n).fill(-1)
  const list = []
  for (let start = 0; start < n; start++) {
    if (!shape[start] || comp[start] >= 0) continue
    const index = list.length
    const cells = []
    let r0 = rows, r1 = 0, c0 = cols, c1 = 0
    const stack = [start]
    comp[start] = index
    while (stack.length) {
      const i = stack.pop()
      cells.push(i)
      const r = (i / cols) | 0
      const c = i % cols
      if (r < r0) r0 = r
      if (r > r1) r1 = r
      if (c < c0) c0 = c
      if (c > c1) c1 = c
      const visit = (j) => {
        if (shape[j] && comp[j] < 0) {
          comp[j] = index
          stack.push(j)
        }
      }
      if (r > 0 && !hEdges[hIdx(cols, r, c)]) visit(i - cols)
      if (r < rows - 1 && !hEdges[hIdx(cols, r + 1, c)]) visit(i + cols)
      if (c > 0 && !vEdges[vIdx(cols, r, c)]) visit(i - 1)
      if (c < cols - 1 && !vEdges[vIdx(cols, r, c + 1)]) visit(i + 1)
    }
    list.push({ index, key: start, name: `Skabelon ${index + 1}`, cells, r0, r1, c0, c1 })
  }
  return { list, comp }
}

/**
 * Kan skabelonen flyttes dr/dc felter? Den skal blive på lærredet og må ikke ramme felter
 * i en anden skabelon (kant i kant er fint). Kanterne er fælles for hele lærredet,
 * så et overlap ville flette skabelonerne sammen.
 */
export function templateFits(project, templates, t, dr, dc) {
  const { cols, rows } = project
  const { comp } = templates
  for (const i of t.cells) {
    const r = ((i / cols) | 0) + dr
    const c = (i % cols) + dc
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    const k = comp[r * cols + c]
    if (k >= 0 && k !== t.index) return false
  }
  return true
}

/**
 * Flytter en hel skabelon (kanter + farver på alle lag) dr/dc felter.
 * Kanter der deles med en anden skabelon bliver stående, så naboen ikke åbnes.
 * Overlapper den nye plads en anden skabelon, returneres projektet uændret.
 */
export function moveTemplate(project, templates, t, dr, dc) {
  if (!templateFits(project, templates, t, dr, dc)) return project
  const { cols, rows } = project
  const { comp } = templates
  const hEdges = project.hEdges.slice()
  const vEdges = project.vEdges.slice()
  const other = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    const k = comp[r * cols + c]
    return k >= 0 && k !== t.index
  }
  const moved = new Map() // 'h12' -> {type,r,c}
  for (const i of t.cells) {
    const r = (i / cols) | 0
    const c = i % cols
    for (const [type, er, ec, nr, nc] of [
      ['h', r, c, r - 1, c],
      ['h', r + 1, c, r + 1, c],
      ['v', r, c, r, c - 1],
      ['v', r, c + 1, r, c + 1],
    ]) {
      const arr = type === 'h' ? hEdges : vEdges
      const idx = type === 'h' ? hIdx(cols, er, ec) : vIdx(cols, er, ec)
      const key = type + idx
      if (!project[type + 'Edges'][idx] || moved.has(key)) continue
      moved.set(key, { type, r: er, c: ec })
      if (!other(nr, nc)) arr[idx] = 0
    }
  }
  for (const e of moved.values()) {
    if (e.type === 'h') hEdges[hIdx(cols, e.r + dr, e.c + dc)] = 1
    else vEdges[vIdx(cols, e.r + dr, e.c + dc)] = 1
  }
  const layers = project.layers.map((l) => {
    const colors = l.colors.slice()
    for (const i of t.cells) colors[i] = null
    for (const i of t.cells) {
      const r = ((i / cols) | 0) + dr
      const c = (i % cols) + dc
      colors[r * cols + c] = l.colors[i]
    }
    return { ...l, colors }
  })
  const { shape } = shapeFromEdges(cols, rows, hEdges, vEdges)
  return setLayers({ ...project, hEdges, vEdges, shape }, layers)
}

/**
 * Strikkeplan for de valgte skabeloner. Hvert "spor" har sin egen rækkeliste:
 *  - synkront: ét spor pr. skabelon, og række k strikkes i alle spor (fx for- og bagside)
 *  - ellers: ét samlet spor der følger lærredets rækker
 */
export function knitPlan(project, templates) {
  const { cols } = project
  const keys = project.knit.focus || []
  let focus = templates.list.filter((t) => keys.includes(t.key))
  if (!focus.length && templates.list.length) focus = [templates.list[0]]
  const sync = project.knit.sync !== false && focus.length > 1
  const groups = sync ? focus.map((t) => [t]) : focus.length ? [focus] : []
  const tracks = groups.map((group) => {
    const mask = new Uint8Array(project.cols * project.rows)
    let r0 = Infinity, r1 = -1, c0 = Infinity
    for (const t of group) {
      for (const i of t.cells) mask[i] = 1
      r0 = Math.min(r0, t.r0)
      r1 = Math.max(r1, t.r1)
      c0 = Math.min(c0, t.c0)
    }
    const rows = []
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < cols; c++) {
        if (mask[r * cols + c]) {
          rows.push(r)
          break
        }
      }
    }
    if (project.knit.startFrom === 'bottom') rows.reverse()
    return { label: group.map((t) => t.name).join(' + '), mask, rows, c0 }
  })
  const total = Math.max(0, ...tracks.map((t) => t.rows.length))
  return { focus, sync, tracks, total }
}

/** Læseretning for række nr. i (0-baseret) i strikkerækkefølgen */
export function rowDirection(project, i) {
  const { direction, firstSide } = project.knit
  const first = firstSide || 'rtl'
  if (direction === 'round') return first
  const other = first === 'rtl' ? 'ltr' : 'rtl'
  return i % 2 === 0 ? first : other
}

/** Segmenter (sammenhængende masker af samme farve) for en grid-række – kun felter i mask */
export function rowSegments(project, gridRow, dir, mask = project.shape) {
  const { cols, colors } = project
  const segs = []
  const order = []
  for (let c = 0; c < cols; c++) order.push(c)
  if (dir === 'rtl') order.reverse()
  let cur = null
  for (const c of order) {
    const i = gridRow * cols + c
    const inside = !!mask[i]
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

export function stitchesInRow(project, gridRow, mask = project.shape) {
  let n = 0
  for (let c = 0; c < project.cols; c++) if (mask[gridRow * project.cols + c]) n++
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

/**
 * Tilføjer en garnfarve til paletten. Findes farven allerede, får den det nye navn (hvis der er skrevet et).
 */
export function addPaletteColor(project, hex, name) {
  hex = hex.toLowerCase()
  name = name.trim()
  const exists = project.palette.some((p) => p.hex.toLowerCase() === hex)
  const palette = exists
    ? project.palette.map((p) => (p.hex.toLowerCase() === hex && name ? { ...p, name } : p))
    : [...project.palette, { hex, name: name || hex }]
  return { ...project, palette }
}

/** Omdøber en farve; er den ikke i paletten endnu (fx en brugt farve), tilføjes den */
export function renamePaletteColor(project, hex, name) {
  const lc = hex.toLowerCase()
  const palette = project.palette.some((p) => p.hex.toLowerCase() === lc)
    ? project.palette.map((p) => (p.hex.toLowerCase() === lc ? { ...p, name } : p))
    : [...project.palette, { hex, name }]
  return { ...project, palette }
}
