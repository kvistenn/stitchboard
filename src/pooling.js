// Planned pooling: et garn med et fast farveforløb (fx 5 m blå, 3 m hvid, 5 m rød, 3 m hvid) strikkes så
// farverne "samler sig" i et mønster. Her lægges forløbet ud maske for maske i strikkerækkefølgen.
import { addLayer, addPaletteColors, setLayers } from './state'

export const POOLING_LAYER = 'Planned pooling'

/** Startforslag: de senest brugte farver med skiftevis lange og korte stykker */
export function defaultPooling(project) {
  const hexes = [...project.recent, ...project.palette.map((p) => p.hex)].filter(Boolean)
  const unique = [...new Set(hexes.map((h) => h.toLowerCase()))].slice(0, 4)
  return {
    sequence: unique.map((hex, k) => ({ hex, count: k % 2 ? 2 : 5 })),
    direction: project.knit?.direction || 'flat',
    offset: 0,
  }
}

/** Antal masker før forløbet gentages */
export function sequenceLength(sequence) {
  return sequence.reduce((n, s) => n + Math.max(0, s.count | 0), 0)
}

/** Forløbet udfoldet til én farve pr. maske */
export function expandSequence(sequence) {
  const out = []
  for (const s of sequence) for (let k = 0; k < (s.count | 0); k++) out.push(s.hex)
  return out
}

/**
 * Felterne i området (maske over lærredet) i strikkerækkefølge: én liste pr. række, nederste eller øverste
 * række først (startFrom), og hver række læst i strikkeretningen. Rundt læses alle rækker fra samme side;
 * frem og tilbage skifter retningen hver række, ligesom garnet gør.
 */
export function poolingRows(project, area, { startFrom = 'bottom', direction = 'flat', firstSide = 'rtl' } = {}) {
  const { cols, rows } = project
  const out = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) if (area[r * cols + c]) row.push(r * cols + c)
    if (row.length) out.push(row)
  }
  if (startFrom === 'bottom') out.reverse()
  const other = firstSide === 'rtl' ? 'ltr' : 'rtl'
  return out.map((row, k) => {
    const dir = direction === 'round' || k % 2 === 0 ? firstSide : other
    return dir === 'rtl' ? row.reverse() : row
  })
}

/**
 * Farverne garnet giver i området: én farve pr. felt (null udenfor området). offset = hvor mange masker inde
 * i forløbet den første maske starter. Tomt forløb = null.
 */
export function plannedPooling(project, area, { sequence, offset = 0, ...order }) {
  const unit = expandSequence(sequence)
  if (!unit.length) return null
  const colors = new Array(project.cols * project.rows).fill(null)
  let k = ((offset % unit.length) + unit.length) % unit.length
  for (const row of poolingRows(project, area, order))
    for (const i of row) {
      colors[i] = unit[k]
      k = (k + 1) % unit.length
    }
  return colors
}

/**
 * Lægger farverne på et lag: laget med id layerId hvis det findes (så man kan prøve sig frem), ellers et nyt
 * lag "Planned pooling" over lag `index`. Farverne kommer i paletten. Returnerer projektet og lagets id.
 */
export function applyPooling(project, colors, index, layerId = null) {
  let p = project
  let k = p.layers.findIndex((l) => l.id === layerId)
  let name = p.layers[k]?.name
  if (k < 0) {
    p = addLayer(p, index)
    k = index + 1
    name = POOLING_LAYER
  }
  const layers = p.layers.map((l, j) => (j === k ? { ...l, name, visible: true, colors } : l))
  p = setLayers(p, layers)
  const { project: withColors } = addPaletteColors(p, [...new Set(colors.filter(Boolean))])
  return { project: withColors, layerId: p.layers[k].id }
}

/** Den bredeste række i området – planned pooling afhænger af maskeantallet pr. række */
export function widestRow(project, area) {
  let max = 0
  for (let r = 0; r < project.rows; r++) {
    let n = 0
    for (let c = 0; c < project.cols; c++) if (area[r * project.cols + c]) n++
    max = Math.max(max, n)
  }
  return max
}
