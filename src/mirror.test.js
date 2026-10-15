import { describe, expect, it } from 'vitest'
import {
  newProject,
  paintCells,
  addNote,
  edgesFromShape,
  shapeFromEdges,
  findTemplates,
  addToSelection,
  flipSelection,
  cellsSelection,
  mirrorCells,
  mirrorRegion,
  mirrorCopyCells,
  mirrorCopyArea,
  rotateCells,
  rotateRegion,
  insertPixels,
  removeColor,
  clearColors,
} from './state'
import { averageBlocks, quantizeCells } from './colors'

const R = '#e11d48'
const B = '#2563eb'

// lærred med en skabelon af felterne `cells` (feltnumre)
function withShape(cols, rows, cells) {
  const p = newProject('Test', cols, rows)
  const want = new Array(cols * rows).fill(0)
  for (const i of cells) want[i] = 1
  const edges = edgesFromShape(cols, rows, want)
  return { ...p, ...edges, shape: shapeFromEdges(cols, rows, edges.hEdges, edges.vEdges).shape }
}

describe('flipSelection / cellsSelection', () => {
  it('spejler områderne inden for rammen', () => {
    const sel = addToSelection({ r0: 0, c0: 0, r1: 0, c1: 0 }, { r0: 1, c0: 3, r1: 1, c1: 3 })
    expect(flipSelection(sel, 'h').rects).toEqual([
      { r0: 0, c0: 3, r1: 0, c1: 3 },
      { r0: 1, c0: 0, r1: 1, c1: 0 },
    ])
    expect(flipSelection({ r0: 2, c0: 2, r1: 4, c1: 5 }, 'v')).toEqual({ r0: 2, c0: 2, r1: 4, c1: 5 })
  })

  it('laver en markering af præcis de felter der gives', () => {
    // 10 kolonner: felterne 0,1,2 og 11 → to striber
    expect(cellsSelection([11, 0, 2, 1], 10).rects).toEqual([
      { r0: 0, c0: 0, r1: 0, c1: 2 },
      { r0: 1, c0: 1, r1: 1, c1: 1 },
    ])
  })
})

describe('mirrorCells (mønster)', () => {
  it('spejlvender markeringen vandret og lodret på det aktive lag', () => {
    const p = paintCells(newProject('Test', 6, 3), 0, [[0, 0], [0, 1], [1, 0]], R)
    const sel = { r0: 0, c0: 0, r1: 1, c1: 2 }
    const h = mirrorCells(p, sel, 'h', 0).project
    expect(h.colors.slice(0, 3)).toEqual([null, R, R])
    expect(h.colors.slice(6, 9)).toEqual([null, null, R])
    const v = mirrorCells(p, sel, 'v', 0).project
    expect(v.colors.slice(0, 3)).toEqual([R, null, null])
    expect(v.colors.slice(6, 9)).toEqual([R, R, null])
  })

  it('lægger en spejlet kopi ved siden af og markerer begge', () => {
    const p = paintCells(newProject('Test', 6, 4), 0, [[0, 0], [1, 1]], R)
    const sel = { r0: 0, c0: 0, r1: 1, c1: 1 }
    const right = mirrorCopyCells(p, sel, 'right', 0)
    // kopien i kolonne 2-3, spejlvendt: (0,0)→(0,3) og (1,1)→(1,2)
    expect(right.project.colors[3]).toBe(R)
    expect(right.project.colors[6 + 2]).toBe(R)
    expect(right.sel).toMatchObject({ r0: 0, c0: 0, r1: 1, c1: 3 })
    // og så nedad: alle fire hjørner af mønstret
    const down = mirrorCopyCells(right.project, right.sel, 'down', 0)
    expect(down.project.colors[3 * 6 + 0]).toBe(R) // (0,0) spejlet ned til (3,0)
    expect(down.project.colors[3 * 6 + 3]).toBe(R)
  })

  it('giver null når der ikke er plads på den side', () => {
    const p = newProject('Test', 6, 4)
    expect(mirrorCopyCells(p, { r0: 0, c0: 0, r1: 1, c1: 1 }, 'left', 0)).toBe(null)
  })
})

describe('mirrorRegion / mirrorCopyArea (skabelon)', () => {
  it('spejlvender en L-formet skabelon med farver og noter', () => {
    // 6x3: L = (0,0),(1,0),(1,1)
    let p = withShape(6, 3, [0, 6, 7])
    p = paintCells(p, 0, [[0, 0]], R)
    p = addNote(p, { id: 'n', r: 1, c: 1, text: 'hæl' })
    const t = findTemplates(p).list[0]
    const { project: next } = mirrorRegion(p, findTemplates(p), cellsSelection(t.cells, 6), 'h')
    const list = findTemplates(next).list
    expect(list).toHaveLength(1)
    expect(list[0].cells.sort((a, b) => a - b)).toEqual([1, 6, 7]) // (0,1),(1,0),(1,1)
    expect(next.colors[1]).toBe(R)
    expect(next.notes).toEqual([{ id: 'n', r: 1, c: 0, text: 'hæl' }])
  })

  it('en halv skabelon spejlet til højre bliver til én hel skabelon', () => {
    // venstre halvdel 2x2 uden kant mod højre
    let p = withShape(8, 3, [0, 1, 8, 9])
    const vEdges = p.vEdges.slice()
    vEdges[2] = vEdges[1 * 9 + 2] = 0 // åbn højre side
    p = { ...p, vEdges, shape: shapeFromEdges(8, 3, p.hEdges, vEdges).shape }
    p = paintCells(p, 0, [[0, 0]], B)
    const res = mirrorCopyArea(p, { r0: 0, c0: 0, r1: 1, c1: 1 }, 'right')
    const list = findTemplates(res.project).list
    expect(list).toHaveLength(1)
    expect(list[0].cells).toHaveLength(8)
    expect(res.project.colors[3]).toBe(B) // (0,0) spejlet til (0,3)
  })
})

describe('rotateCells (mønster)', () => {
  it('roterer 90° med og mod uret om midten', () => {
    // 3 bred x 1 høj stribe i række 2: R B . → bliver lodret i kolonne 1
    const p = paintCells(paintCells(newProject('Test', 5, 5), 0, [[2, 0]], R), 0, [[2, 1]], B)
    const sel = { r0: 2, c0: 0, r1: 2, c1: 2 }
    const cw = rotateCells(p, sel, 'cw', 0)
    expect(cw.sel).toEqual({ r0: 1, c0: 1, r1: 3, c1: 1 })
    expect(cw.project.colors[1 * 5 + 1]).toBe(R) // venstre ende kommer øverst
    expect(cw.project.colors[2 * 5 + 1]).toBe(B)
    expect(cw.project.colors[2 * 5 + 0]).toBe(null) // gammel plads ryddet
    const ccw = rotateCells(p, sel, 'ccw', 0)
    expect(ccw.project.colors[3 * 5 + 1]).toBe(R) // mod uret: venstre ende kommer nederst
  })

  it('fire rotationer giver det oprindelige – også med ulige forskel på bredde og højde', () => {
    let p = paintCells(newProject('Test', 8, 8), 0, [[1, 1], [2, 2], [1, 3]], R)
    let sel = { r0: 1, c0: 1, r1: 2, c1: 3 } // 3x2
    for (let i = 0; i < 4; i++) ({ project: p, sel } = rotateCells(p, sel, 'cw', 0))
    expect(sel).toEqual({ r0: 1, c0: 1, r1: 2, c1: 3 })
    expect(p.colors[1 * 8 + 1]).toBe(R)
    expect(p.colors[2 * 8 + 2]).toBe(R)
    expect(p.colors[1 * 8 + 3]).toBe(R)
    expect(p.colors.filter(Boolean)).toHaveLength(3)
  })

  it('roterer en markering med flere områder', () => {
    const p = newProject('Test', 6, 6)
    const sel = addToSelection({ r0: 0, c0: 0, r1: 0, c1: 0 }, { r0: 1, c0: 2, r1: 1, c1: 2 })
    const { sel: next } = rotateCells(p, sel, 'cw', 0)
    // 3x2-ramme → 2x3; (0,0)→(0,1) og (1,2)→(2,0) relativt, rammen flyttet om midten til (0,0)
    expect(next.rects).toEqual([
      { r0: 0, c0: 1, r1: 0, c1: 1 },
      { r0: 2, c0: 0, r1: 2, c1: 0 },
    ])
  })

  it('giver null når det roterede område ikke kan være på lærredet', () => {
    const p = newProject('Test', 6, 2)
    expect(rotateCells(p, { r0: 0, c0: 0, r1: 0, c1: 4 }, 'cw', 0)).toBe(null)
  })
})

describe('rotateRegion (skabelon)', () => {
  it('roterer en L-formet skabelon med kanter, farver og noter', () => {
    // 6x6: L = (0,0),(1,0),(1,1) – med uret bliver den (0,0),(0,1),(1,0)
    let p = withShape(6, 6, [0, 6, 7])
    p = paintCells(p, 0, [[1, 0]], R)
    p = addNote(p, { id: 'n', r: 1, c: 1, text: 'hæl' })
    const t = findTemplates(p).list[0]
    const res = rotateRegion(p, findTemplates(p), cellsSelection(t.cells, 6), 'cw')
    const list = findTemplates(res.project).list
    expect(list).toHaveLength(1)
    expect(list[0].cells.sort((a, b) => a - b)).toEqual([0, 1, 6])
    expect(res.project.colors[0]).toBe(R) // (1,0) → (0,0)
    expect(res.project.notes).toEqual([{ id: 'n', r: 1, c: 0, text: 'hæl' }])
  })

  it('frem og tilbage giver samme skabelon', () => {
    const p = withShape(8, 8, [9, 10, 11, 17]) // 3x2-L
    const sel = cellsSelection(findTemplates(p).list[0].cells, 8)
    const cw = rotateRegion(p, findTemplates(p), sel, 'cw')
    const back = rotateRegion(cw.project, findTemplates(cw.project), cw.sel, 'ccw')
    expect(back.project.hEdges).toEqual(p.hEdges)
    expect(back.project.vEdges).toEqual(p.vEdges)
  })
})

describe('insertPixels', () => {
  it('lægger farverne på et nyt lag "Billede" og i paletten', () => {
    const p = newProject('Test', 4, 2)
    const { project: next, layerId } = insertPixels(p, {
      r0: 1,
      c0: 2,
      w: 3,
      h: 1,
      hexes: ['#123456', null, '#123456'], // det sidste felt falder udenfor lærredet
      index: 0,
    })
    expect(next.layers).toHaveLength(2)
    expect(next.layers[1]).toMatchObject({ id: layerId, name: 'Billede' })
    expect(next.colors[1 * 4 + 2]).toBe('#123456')
    expect(next.colors[1 * 4 + 3]).toBe(null)
    expect(next.palette.at(-1)).toEqual({ hex: '#123456', name: 'Farve 1' })
    expect(next.recent[0]).toBe('#123456')
  })

  it('kun indenfor skabelonen, og uden nye farver i paletten', () => {
    const p = withShape(4, 1, [0, 1])
    const { project: next } = insertPixels(p, {
      r0: 0,
      c0: 0,
      w: 4,
      h: 1,
      hexes: [R, R, R, R],
      index: 0,
      insideOnly: true,
      addColors: false,
    })
    expect(next.colors).toEqual([R, R, null, null])
    expect(next.palette).toEqual(p.palette)
  })
})

describe('averageBlocks / quantizeCells', () => {
  it('tager gennemsnittet af hver blok og springer gennemsigtige over', () => {
    // 2x1 felter à 2x2 pixels: venstre rød/blå blandet, højre gennemsigtig
    const px = (r, g, b, a = 255) => [r, g, b, a]
    const row0 = [...px(255, 0, 0), ...px(0, 0, 255), ...px(0, 0, 0, 0), ...px(0, 0, 0, 0)]
    const row1 = [...px(255, 0, 0), ...px(0, 0, 255), ...px(0, 0, 0, 0), ...px(0, 0, 0, 0)]
    const cells = averageBlocks(new Uint8ClampedArray([...row0, ...row1]), 2, 1, 2)
    expect(cells[0]).toEqual({ r: 127.5, g: 0, b: 127.5 })
    expect(cells[1]).toBe(null)
  })

  it('giver hvert felt den nærmeste farve', () => {
    const cells = [{ r: 250, g: 10, b: 10 }, null, { r: 10, g: 10, b: 240 }]
    expect(quantizeCells(cells, 2, ['#FF0000', '#0000ff'])).toEqual(['#ff0000', null, '#0000ff'])
    expect(quantizeCells(cells, 2)).toEqual(['#fa0a0a', null, '#0a0af0'])
  })
})

describe('removeColor / clearColors', () => {
  it('fjerner farven fra bjælken og paletten og vælger den næste', () => {
    const p = { ...newProject('Test', 2, 2), currentColor: '#2563eb' }
    const next = removeColor(p, '#2563EB')
    expect(next.recent).not.toContain('#2563eb')
    expect(next.palette.some((x) => x.hex === '#2563eb')).toBe(false)
    expect(next.currentColor).toBe(next.recent[0])
    // kun fra bjælken
    const bar = removeColor(p, '#e11d48', false)
    expect(bar.recent).not.toContain('#e11d48')
    expect(bar.palette.some((x) => x.hex === '#e11d48')).toBe(true)
  })

  it('kan tømme alle farver, uden at det tegnede forsvinder', () => {
    const p = paintCells(newProject('Test', 2, 2), 0, [[0, 0]], R)
    const next = clearColors(p)
    expect(next).toMatchObject({ palette: [], recent: [], currentColor: null })
    expect(next.colors[0]).toBe(R)
  })
})
