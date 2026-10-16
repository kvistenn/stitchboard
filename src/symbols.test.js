import { describe, expect, it } from 'vitest'
import {
  newProject,
  paintSymbols,
  symbolsOf,
  moveCells,
  copyRegion,
  pasteRegion,
  mirrorCells,
  rotateCells,
  rotateRegion,
  resizeProject,
  rowSegments,
  segmentText,
  cropToTemplate,
  edgesFromShape,
  shapeFromEdges,
  findTemplates,
  moveTemplate,
  deleteTemplate,
  copyTemplate,
  pasteTemplate,
  copyArea,
  pasteArea,
} from './state'
import { contrastColor, shade } from './colors'
import { applyPooling, plannedPooling, poolingRows, sequenceLength, widestRow } from './pooling'

// 6x2 lærred: skabelonen er de tre højre felter i begge rækker
function project() {
  const p = newProject('Test', 6, 2)
  const want = [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]
  const edges = edgesFromShape(6, 2, want)
  return { ...p, ...edges, shape: shapeFromEdges(6, 2, edges.hEdges, edges.vEdges).shape }
}

describe('symboler', () => {
  it('gamle projekter uden symboler får en tom liste', () => {
    const p = { ...newProject('x', 3, 2), symbols: undefined }
    expect(symbolsOf(p)).toEqual([null, null, null, null, null, null])
  })

  it('sætter og fjerner symboler', () => {
    let p = paintSymbols(project(), [[0, 3], [1, 4]], 'purl')
    expect(p.symbols[3]).toBe('purl')
    expect(p.symbols[10]).toBe('purl')
    p = paintSymbols(p, [[0, 3]], null)
    expect(p.symbols[3]).toBe(null)
  })

  it('følger felterne når en markering flyttes, kopieres og spejles', () => {
    const p = paintSymbols(project(), [[0, 0]], 'k2tog')
    const moved = moveCells(p, { r0: 0, c0: 0, r1: 0, c1: 0 }, 1, 3, 0)
    expect(moved.symbols[0]).toBe(null)
    expect(moved.symbols[9]).toBe('k2tog')

    const clip = copyRegion(p, { r0: 0, c0: 0, r1: 0, c1: 1 }, 0)
    const { project: pasted } = pasteRegion(p, clip, 1, 2, 0)
    expect(pasted.symbols[8]).toBe('k2tog')
    expect(pasted.symbols[0]).toBe('k2tog')

    // vandret spejling vender indtagningen: 2 ret sammen bliver drejet
    const { project: mirrored } = mirrorCells(p, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'h', 0)
    expect(mirrored.symbols[0]).toBe(null)
    expect(mirrored.symbols[1]).toBe('ssk')
  })

  it('drejes med når en markering roteres', () => {
    // 1×2 vandret stribe (0,0)-(0,1) drejes 90° med uret om midten: bliver 2×1 lodret
    const p = paintSymbols(project(), [[0, 0]], 'yo')
    const res = rotateCells(p, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'cw', 0)
    expect(res.project.symbols.filter(Boolean)).toEqual(['yo'])
    expect(res.project.symbols[0]).toBe('yo') // øverste felt i den lodrette stribe
    const t = findTemplates(p)
    const area = rotateRegion(p, t, { r0: 0, c0: 3, r1: 1, c1: 3 }, 'cw')
    expect(area.project.symbols.filter(Boolean)).toEqual(['yo'])
  })

  it('flyttes med når lærredet ændrer størrelse', () => {
    const p = paintSymbols(project(), [[1, 5]], 'yo')
    const next = resizeProject(p, 8, 3, 1, 2)
    expect(next.symbols.length).toBe(24)
    expect(next.symbols[2 * 8 + 7]).toBe('yo')
  })

  it('følger en skabelon der flyttes, kopieres eller slettes', () => {
    const p = paintSymbols(project(), [[0, 3]], 'sl')
    const t = findTemplates(p).list[0]
    const moved = moveTemplate(p, findTemplates(p), t, 0, -3)
    expect(moved.symbols[0]).toBe('sl')
    expect(moved.symbols[3]).toBe(null)

    const big = resizeProject(p, 10, 2)
    const bt = findTemplates(big).list[0]
    const copy = pasteTemplate(big, copyTemplate(big, bt), 0, 7)
    expect(copy.symbols[7]).toBe('sl')

    expect(deleteTemplate(p, findTemplates(p), t).symbols[3]).toBe(null)
  })

  it('kommer med i skabelon-tilstandens kopi af et område', () => {
    const p = paintSymbols(project(), [[0, 3]], 'bobble')
    const clip = copyArea(p, { r0: 0, c0: 3, r1: 0, c1: 3 })
    const { project: next } = pasteArea(p, clip, 1, 0)
    expect(next.symbols[6]).toBe('bobble')
  })

  it('beskæres væk udenfor skabelonen', () => {
    const p = paintSymbols(project(), [[0, 0], [0, 3]], 'purl')
    const next = cropToTemplate(p)
    expect(next.symbols[0]).toBe(null)
    expect(next.symbols[3]).toBe('purl')
  })

  it('deler farveskiftene i strik-tilstand og læses op', () => {
    const p = paintSymbols(project(), [[0, 4]], 'purl')
    const segs = rowSegments(p, 0, 'ltr')
    expect(segs.map((s) => s.count)).toEqual([1, 1, 1])
    expect(segmentText(p, segs[1])).toBe('1 Hvid – vrang')
  })
})

describe('kontrastfarve', () => {
  it('mørk tekst på lyse farver og hvid på mørke', () => {
    expect(contrastColor('#ffffff')).toBe('#0f172a')
    expect(contrastColor('#f59e0b')).toBe('#0f172a')
    expect(contrastColor('#1f2937')).toBe('#ffffff')
    expect(contrastColor('#2563eb')).toBe('#ffffff')
  })
  it('gør farver mørkere og lysere', () => {
    expect(shade('#ffffff', -0.5)).toBe('#808080')
    expect(shade('#000000', 0.5)).toBe('#808080')
  })
})

describe('planned pooling', () => {
  const p = newProject('Pool', 4, 3)
  const all = new Array(12).fill(1)
  const seq = [
    { hex: '#aa0000', count: 2 },
    { hex: '#0000aa', count: 3 },
  ]

  it('frem og tilbage: garnet vender ved enden af hver række', () => {
    const rows = poolingRows(p, all, { startFrom: 'bottom', direction: 'flat', firstSide: 'rtl' })
    expect(rows).toEqual([
      [11, 10, 9, 8],
      [4, 5, 6, 7],
      [3, 2, 1, 0],
    ])
  })

  it('rundt: alle rækker læses fra samme side', () => {
    const rows = poolingRows(p, all, { startFrom: 'top', direction: 'round', firstSide: 'ltr' })
    expect(rows[1]).toEqual([4, 5, 6, 7])
    expect(rows[2]).toEqual([8, 9, 10, 11])
  })

  it('lægger forløbet ud maske for maske – også med forskydning', () => {
    const colors = plannedPooling(p, all, { sequence: seq, direction: 'round', startFrom: 'top', firstSide: 'ltr' })
    expect(colors.slice(0, 6)).toEqual(['#aa0000', '#aa0000', '#0000aa', '#0000aa', '#0000aa', '#aa0000'])
    const shifted = plannedPooling(p, all, { sequence: seq, offset: 2, direction: 'round', startFrom: 'top', firstSide: 'ltr' })
    expect(shifted[0]).toBe('#0000aa')
    expect(sequenceLength(seq)).toBe(5)
    expect(plannedPooling(p, all, { sequence: [] })).toBe(null)
  })

  it('kun felterne i området', () => {
    const area = [0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]
    const colors = plannedPooling(p, area, { sequence: seq, direction: 'flat', startFrom: 'top', firstSide: 'ltr' })
    expect(colors[0]).toBe(null)
    expect(colors[1]).toBe('#aa0000')
    expect(colors[6]).toBe('#0000aa') // række 2 går tilbage: felt 6 kommer før felt 5
    expect(widestRow(p, area)).toBe(2)
  })

  it('opretter et lag første gang og genbruger det bagefter', () => {
    const colors = plannedPooling(p, all, { sequence: seq })
    const first = applyPooling(p, colors, 0)
    expect(first.project.layers).toHaveLength(2)
    expect(first.project.layers[1].name).toBe('Planned pooling')
    expect(first.project.palette.some((x) => x.hex === '#aa0000')).toBe(true)
    const again = applyPooling(first.project, colors.map(() => '#0000aa'), 0, first.layerId)
    expect(again.project.layers).toHaveLength(2)
    expect(again.layerId).toBe(first.layerId)
    expect(again.project.colors[0]).toBe('#0000aa')
  })
})
