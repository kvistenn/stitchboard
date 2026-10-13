import { describe, expect, it } from 'vitest'
import {
  addLayer,
  addNote,
  clearLayer,
  copyRegion,
  copyTemplate,
  cropToTemplate,
  duplicateLayer,
  edgesFromShape,
  ensureLayers,
  findTemplateSpot,
  findTemplates,
  flattenLayers,
  hasValidLayers,
  layerIndexById,
  floodFill,
  hasDraftOutside,
  layerBounds,
  moveCells,
  moveRegion,
  countRegion,
  moveLayerOrder,
  moveTemplate,
  templateFits,
  newProject,
  paintCells,
  pasteRegion,
  pasteTemplate,
  removeLayer,
  removeNote,
  renameLayer,
  resizeProject,
  setLayerColors,
  shapeFromEdges,
  shiftLayer,
  toggleLayer,
  updateNote,
  vIdx,
} from './state'

// 6x2 lærred: skabelonen er de tre højre felter i begge rækker, resten er udenfor
function project() {
  const p = newProject('Test', 6, 2)
  const want = [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]
  const edges = edgesFromShape(6, 2, want)
  return { ...p, ...edges, shape: shapeFromEdges(6, 2, edges.hEdges, edges.vEdges).shape }
}

// hjælper: sæt farver på et lag uden om de skrivende funktioner under test
const onLayer = (p, index, colors) => setLayerColors(p, index, colors)

describe('moveCells', () => {
  it('flytter et mønster tegnet udenfor skabelonen ind på den', () => {
    const p = project()
    const colors = p.layers[0].colors.slice()
    colors[0] = '#e11d48' // (0,0) udenfor
    colors[7] = '#2563eb' // (1,1) udenfor
    const next = moveCells(onLayer(p, 0, colors), { r0: 0, c0: 0, r1: 1, c1: 1 }, 0, 3, 0)
    expect(next.colors[0]).toBe(null)
    expect(next.colors[7]).toBe(null)
    expect(next.colors[3]).toBe('#e11d48')
    expect(next.colors[10]).toBe('#2563eb')
  })

  it('flytter kun det aktive lag – laget nedenunder bliver liggende', () => {
    let p = paintCells(project(), 0, [[0, 0]], '#16a34a') // baggrund
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[0, 0]], '#e11d48')
    const next = moveCells(p, { r0: 0, c0: 0, r1: 0, c1: 0 }, 0, 1, 1)
    expect(next.colors[0]).toBe('#16a34a') // baggrunden kommer frem igen
    expect(next.colors[1]).toBe('#e11d48')
  })
})

describe('floodFill', () => {
  it('fylder udenfor skabelonen uden at løbe ind i den', () => {
    const next = floodFill(project(), 0, 0, '#16a34a', 0)
    expect(next.colors.slice(0, 6)).toEqual(['#16a34a', '#16a34a', '#16a34a', null, null, null])
  })

  it('fylder indenfor skabelonen uden at løbe ud', () => {
    const next = floodFill(project(), 0, 4, '#16a34a', 0)
    expect(next.colors.slice(0, 6)).toEqual([null, null, null, '#16a34a', '#16a34a', '#16a34a'])
  })

  it('finder området ud fra det man ser, men fylder kun det aktive lag', () => {
    // figur på øverste lag i (0,4); fyld baggrund på nederste lag rundt om den
    let p = addLayer(project(), 0)
    p = paintCells(p, 1, [[0, 4]], '#e11d48')
    const next = floodFill(p, 0, 3, '#2563eb', 0)
    expect(next.layers[0].colors[4]).toBe(null) // ikke fyldt under figuren
    expect(next.layers[0].colors[3]).toBe('#2563eb')
    expect(next.layers[0].colors[10]).toBe('#2563eb') // (1,4) lige under figuren
    expect(next.layers[0].colors[5]).toBe('#2563eb') // (0,5) nås uden om figuren via række 1
    expect(next.layers[1].colors[4]).toBe('#e11d48')
  })
})

describe('copyRegion / pasteRegion', () => {
  it('kopierer en markering og indsætter den et nyt sted', () => {
    const p0 = project()
    const colors = p0.layers[0].colors.slice()
    colors[0] = '#e11d48' // (0,0)
    colors[7] = '#2563eb' // (1,1)
    const p = onLayer(p0, 0, colors)
    const clip = copyRegion(p, { r0: 0, c0: 0, r1: 1, c1: 1 }, 0)
    expect(clip).toEqual({ kind: 'pattern', r0: 0, c0: 0, w: 2, h: 2, colors: ['#e11d48', null, null, '#2563eb'] })
    const { project: next, sel } = pasteRegion(p, clip, 0, 3, 0)
    expect(next.colors[3]).toBe('#e11d48')
    expect(next.colors[10]).toBe('#2563eb')
    expect(next.colors[0]).toBe('#e11d48') // originalen bliver stående
    expect(sel).toEqual({ r0: 0, c0: 3, r1: 1, c1: 4 })
  })

  it('kopierer kun fra det aktive lag', () => {
    let p = paintCells(project(), 0, [[0, 0]], '#16a34a')
    p = addLayer(p, 0)
    const clip = copyRegion(p, { r0: 0, c0: 0, r1: 0, c1: 0 }, 1)
    expect(clip.colors).toEqual([null])
  })

  it('lader hvide felter i kopien være gennemsigtige', () => {
    const p = paintCells(project(), 0, [[0, 4]], '#16a34a') // ligger under det tomme felt i kopien
    const clip = { kind: 'pattern', r0: 0, c0: 0, w: 2, h: 1, colors: ['#e11d48', null] }
    const { project: next } = pasteRegion(p, clip, 0, 3, 0)
    expect(next.colors[3]).toBe('#e11d48')
    expect(next.colors[4]).toBe('#16a34a')
  })

  it('skubber indsættelsen ind så den holder sig indenfor gridet', () => {
    const p = project()
    const clip = { kind: 'pattern', r0: 0, c0: 0, w: 2, h: 2, colors: ['#e11d48', null, null, '#2563eb'] }
    const { project: next, sel } = pasteRegion(p, clip, 1, 5, 0)
    expect(sel).toEqual({ r0: 0, c0: 4, r1: 1, c1: 5 })
    expect(next.colors[4]).toBe('#e11d48')
    expect(next.colors[11]).toBe('#2563eb')
  })
})

describe('copyTemplate / pasteTemplate', () => {
  // 10x4 lærred med én 2x2-skabelon i øverste venstre hjørne
  function withTemplate() {
    const p = newProject('Test', 10, 4)
    const want = new Array(40).fill(0)
    for (const i of [0, 1, 10, 11]) want[i] = 1
    const edges = edgesFromShape(10, 4, want)
    const shaped = { ...p, ...edges, shape: shapeFromEdges(10, 4, edges.hEdges, edges.vEdges).shape }
    return paintCells(paintCells(shaped, 0, [[0, 0]], '#e11d48'), 0, [[1, 1]], '#2563eb')
  }

  it('indsætter en kopi af skabelonen med kanter og farver', () => {
    const p = withTemplate()
    const t = findTemplates(p).list[0]
    const clip = copyTemplate(p, t)
    expect(clip.kind).toBe('template')
    const next = pasteTemplate(p, clip, 0, 4)
    const list = findTemplates(next).list
    expect(list).toHaveLength(2)
    expect(list[1].cells.sort((a, b) => a - b)).toEqual([4, 5, 14, 15])
    expect(next.colors[4]).toBe('#e11d48')
    expect(next.colors[15]).toBe('#2563eb')
    // originalen er urørt
    expect(next.colors[0]).toBe('#e11d48')
  })

  it('kopierer alle lag med og opretter manglende lag ved indsættelse', () => {
    let p = addLayer(withTemplate(), 0)
    p = paintCells(p, 1, [[0, 1]], '#f59e0b')
    const clip = copyTemplate(p, findTemplates(p).list[0])
    const target = withTemplate() // kun ét lag
    const next = pasteTemplate(target, clip, 0, 4)
    expect(next.layers).toHaveLength(2)
    expect(next.layers[1].colors[5]).toBe('#f59e0b')
    expect(next.layers[0].colors[4]).toBe('#e11d48')
  })

  it('flytter skabelonens felter på alle lag', () => {
    let p = addLayer(withTemplate(), 0)
    p = paintCells(p, 1, [[0, 1]], '#f59e0b')
    const templates = findTemplates(p)
    const next = moveTemplate(p, templates, templates.list[0], 0, 4)
    expect(next.layers[0].colors[4]).toBe('#e11d48')
    expect(next.layers[1].colors[5]).toBe('#f59e0b')
    expect(next.layers[1].colors[1]).toBe(null)
    expect(next.colors).toEqual(flattenLayers(next.layers, 40))
  })

  it('kan ikke flytte en skabelon ind over en anden – begge forbliver urørte', () => {
    const p = pasteTemplate(withTemplate(), copyTemplate(withTemplate(), findTemplates(withTemplate()).list[0]), 0, 4)
    const templates = findTemplates(p)
    const [a] = templates.list
    expect(templateFits(p, templates, a, 0, 3)).toBe(false) // overlapper med én kolonne
    expect(moveTemplate(p, templates, a, 0, 3)).toBe(p)
  })

  it('må gerne ligge kant i kant med en anden skabelon', () => {
    const p = pasteTemplate(withTemplate(), copyTemplate(withTemplate(), findTemplates(withTemplate()).list[0]), 0, 4)
    const templates = findTemplates(p)
    const [a] = templates.list
    expect(templateFits(p, templates, a, 0, 2)).toBe(true)
    const list = findTemplates(moveTemplate(p, templates, a, 0, 2)).list
    expect(list).toHaveLength(2)
    expect(list.map((t) => t.cells.length)).toEqual([4, 4])
  })

  it('finder plads til højre for originalen med 2 felters mellemrum', () => {
    const p = withTemplate()
    const clip = copyTemplate(p, findTemplates(p).list[0])
    expect(findTemplateSpot(p, clip)).toEqual([0, 4])
  })

  it('går nedenunder når der ikke er plads til højre', () => {
    const p = withTemplate()
    // 4 felter bredt lærred: ingen plads til højre, men plads under
    const narrow = { ...p, cols: 3, rows: 6, shape: new Array(18).fill(0) }
    for (const i of [0, 1, 3, 4]) narrow.shape[i] = 1
    const clip = { kind: 'template', r0: 0, c0: 0, w: 2, h: 2 }
    expect(findTemplateSpot(narrow, clip)).toEqual([4, 0])
  })

  it('giver null når der hverken er plads til højre eller nedenunder', () => {
    const p = withTemplate()
    const clip = { kind: 'template', r0: 0, c0: 0, w: 2, h: 3 }
    expect(findTemplateSpot({ ...p, cols: 4, rows: 4 }, clip)).toBe(null)
  })
})

describe('cropToTemplate', () => {
  it('sletter mønster udenfor skabelonen på alle lag og beholder det indenfor', () => {
    let p = paintCells(project(), 0, [[0, 1], [0, 4]], '#2563eb')
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[0, 2]], '#e11d48')
    p = toggleLayer(p, 1) // også skjulte lag beskæres
    expect(hasDraftOutside(p)).toBe(true)
    const next = cropToTemplate(p)
    expect(next.layers[0].colors[1]).toBe(null)
    expect(next.layers[0].colors[4]).toBe('#2563eb')
    expect(next.layers[1].colors[2]).toBe(null)
    expect(hasDraftOutside(next)).toBe(false)
  })
})

describe('resizeProject med lag', () => {
  it('ændrer størrelse på alle lag', () => {
    let p = paintCells(newProject('Test', 4, 4), 0, [[1, 1]], '#2563eb')
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[3, 3]], '#e11d48')
    const next = resizeProject(p, 2, 2)
    expect(next.layers.map((l) => l.colors.length)).toEqual([4, 4])
    expect(next.layers[0].colors[3]).toBe('#2563eb')
    expect(next.layers[1].colors).toEqual([null, null, null, null])
    expect(next.colors).toEqual(flattenLayers(next.layers, 4))
  })
})

describe('noter', () => {
  it('nye projekter har ingen noter', () => {
    expect(newProject('Test', 4, 4).notes).toEqual([])
  })

  it('tilføjer, retter og sletter en note', () => {
    let p = newProject('Test', 10, 10)
    p = addNote(p, { id: 'a', r: 2, c: 3, text: 'Forstykke' })
    expect(p.notes).toEqual([{ id: 'a', r: 2, c: 3, text: 'Forstykke' }])
    p = updateNote(p, 'a', { text: 'Bagstykke', c: 5 })
    expect(p.notes).toEqual([{ id: 'a', r: 2, c: 5, text: 'Bagstykke' }])
    p = removeNote(p, 'a')
    expect(p.notes).toEqual([])
  })

  it('holder noter indenfor lærredet', () => {
    let p = newProject('Test', 10, 10)
    p = addNote(p, { id: 'a', r: -3, c: 40, text: 'x' })
    expect(p.notes[0]).toMatchObject({ r: 0, c: 9 })
    p = updateNote(p, 'a', { r: 12 })
    expect(p.notes[0]).toMatchObject({ r: 9 })
  })

  it('virker på projekter gemt før noterne fandtes', () => {
    const { notes, ...old } = newProject('Test', 10, 10)
    expect(notes).toEqual([])
    expect(addNote(old, { id: 'a', r: 1, c: 1, text: 'x' }).notes).toHaveLength(1)
  })

  it('skubber noter ind når lærredet bliver mindre', () => {
    const p = addNote(newProject('Test', 10, 10), { id: 'a', r: 8, c: 8, text: 'x' })
    expect(resizeProject(p, 5, 5).notes[0]).toMatchObject({ r: 4, c: 4 })
  })
})

describe('lag', () => {
  const R = '#e11d48'
  const B = '#2563eb'
  const W = '#ffffff'

  it('nye projekter har ét tomt synligt lag', () => {
    const p = newProject('Test', 3, 2)
    expect(p.layers).toHaveLength(1)
    expect(p.layers[0]).toMatchObject({ name: 'Lag 1', visible: true })
    expect(p.layers[0].colors).toEqual(new Array(6).fill(null))
  })

  it('lægger synlige lag sammen – øverste farve vinder, null er gennemsigtig', () => {
    const layers = [
      { id: 'a', name: 'A', visible: true, colors: [R, R, null] },
      { id: 'b', name: 'B', visible: true, colors: [null, B, null] },
    ]
    expect(flattenLayers(layers, 3)).toEqual([R, B, null])
  })

  it('hvid på et øvre lag dækker', () => {
    const layers = [
      { id: 'a', name: 'A', visible: true, colors: [R] },
      { id: 'b', name: 'B', visible: true, colors: [W] },
    ]
    expect(flattenLayers(layers, 1)).toEqual([W])
  })

  it('skjulte lag tæller ikke med', () => {
    let p = newProject('Test', 2, 1)
    p = paintCells(p, 0, [[0, 0]], R)
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[0, 0]], B)
    expect(p.colors).toEqual([B, null])
    p = toggleLayer(p, 1)
    expect(p.colors).toEqual([R, null])
  })

  it('opretter lag med laveste ledige navn over det givne lag', () => {
    let p = newProject('Test', 2, 1)
    p = addLayer(p, 0)
    p = addLayer(p, 0)
    expect(p.layers.map((l) => l.name)).toEqual(['Lag 1', 'Lag 3', 'Lag 2'])
  })

  it('duplikerer et lag med egne farver', () => {
    let p = paintCells(newProject('Test', 2, 1), 0, [[0, 1]], R)
    p = duplicateLayer(p, 0)
    expect(p.layers[1].name).toBe('Lag 1 (kopi)')
    expect(p.layers[1].colors).toEqual([null, R])
    expect(p.layers[1].id).not.toBe(p.layers[0].id)
    p = paintCells(p, 1, [[0, 0]], B)
    expect(p.layers[0].colors).toEqual([null, R]) // originalen er urørt
  })

  it('sletter et lag, men aldrig det sidste', () => {
    let p = addLayer(newProject('Test', 2, 1), 0)
    p = removeLayer(p, 1)
    expect(p.layers).toHaveLength(1)
    expect(removeLayer(p, 0)).toBe(p)
  })

  it('flytter et lag op og ned i rækkefølgen', () => {
    let p = paintCells(newProject('Test', 1, 1), 0, [[0, 0]], R)
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[0, 0]], B)
    expect(p.colors).toEqual([B])
    p = moveLayerOrder(p, 1, -1)
    expect(p.layers.map((l) => l.name)).toEqual(['Lag 2', 'Lag 1'])
    expect(p.colors).toEqual([R])
    expect(moveLayerOrder(p, 1, 1)).toBe(p) // allerede øverst
  })

  it('omdøber, men ignorerer tomt navn', () => {
    let p = renameLayer(newProject('Test', 1, 1), 0, '  Hjort  ')
    expect(p.layers[0].name).toBe('Hjort')
    expect(renameLayer(p, 0, '   ')).toBe(p)
  })

  it('rydder et lag', () => {
    const p = clearLayer(paintCells(newProject('Test', 2, 1), 0, [[0, 0]], R), 0)
    expect(p.layers[0].colors).toEqual([null, null])
    expect(p.colors).toEqual([null, null])
  })

  it('finder indholdets omkreds', () => {
    expect(layerBounds([null, null, null, R, null, B], 3)).toEqual({ r0: 1, c0: 0, r1: 1, c1: 2 })
    expect(layerBounds([null, null], 2)).toBe(null)
  })

  it('flytter et helt lag uden at røre de andre', () => {
    let p = paintCells(newProject('Test', 4, 1), 0, [[0, 3]], B) // baggrund
    p = addLayer(p, 0)
    p = paintCells(p, 1, [[0, 0]], R)
    p = shiftLayer(p, 1, 0, 2)
    expect(p.layers[1].colors).toEqual([null, null, R, null])
    expect(p.layers[0].colors).toEqual([null, null, null, B])
    expect(p.colors).toEqual([null, null, R, B])
  })

  it('lader aldrig indhold falde ud over kanten', () => {
    let p = paintCells(newProject('Test', 4, 2), 0, [[0, 1], [0, 2]], R)
    p = shiftLayer(p, 0, 5, 5)
    expect(layerBounds(p.layers[0].colors, 4)).toEqual({ r0: 1, c0: 2, r1: 1, c1: 3 })
    expect(p.layers[0].colors.filter(Boolean)).toHaveLength(2)
  })

  it('ensureLayers laver et gammelt projekt om til ét lag med farverne', () => {
    const { layers, ...old } = newProject('Test', 2, 1)
    expect(layers).toHaveLength(1)
    const p = ensureLayers({ ...old, colors: [R, null] })
    expect(p.layers).toHaveLength(1)
    expect(p.layers[0]).toMatchObject({ name: 'Lag 1', visible: true, colors: [R, null] })
    expect(p.colors).toEqual([R, null])
  })

  it('ensureLayers reparerer lag med forkert længde eller manglende felter', () => {
    const base = newProject('Test', 2, 1)
    const broken = ensureLayers({ ...base, colors: [B, null], layers: [{ colors: [R] }] })
    expect(broken.layers).toHaveLength(1)
    expect(broken.layers[0].colors).toEqual([B, null]) // forkert længde → bygget fra colors
    const noVisible = ensureLayers({ ...base, layers: [{ colors: [R, null] }] })
    expect(noVisible.layers[0]).toMatchObject({ name: 'Lag 1', visible: true })
    expect(noVisible.layers[0].id).toBeTruthy()
    expect(noVisible.colors).toEqual([R, null])
  })

  it('setLayerColors holder colors i trit med lagene', () => {
    const p = setLayerColors(newProject('Test', 2, 1), 0, [R, B])
    expect(p.colors).toEqual(flattenLayers(p.layers, 2))
  })
})

describe('lag-robusthed', () => {
  it('hasValidLayers afviser manglende, tomme og forkert lange lag', () => {
    const p = newProject('Test', 2, 1)
    expect(hasValidLayers(p)).toBe(true)
    expect(hasValidLayers({ ...p, layers: undefined })).toBe(false)
    expect(hasValidLayers({ ...p, layers: [] })).toBe(false)
    expect(hasValidLayers({ ...p, layers: [{ ...p.layers[0], colors: [null] }] })).toBe(false)
  })

  it('layerIndexById finder laget og falder tilbage til det øverste', () => {
    let p = addLayer(newProject('Test', 1, 1), 0)
    const [a, b] = p.layers
    expect(layerIndexById(p.layers, a.id)).toBe(0)
    expect(layerIndexById(p.layers, b.id)).toBe(1)
    expect(layerIndexById(p.layers, 'findes-ikke')).toBe(1)
    p = moveLayerOrder(p, 1, -1)
    expect(layerIndexById(p.layers, b.id)).toBe(0) // følger laget, ikke pladsen
  })
})

describe('moveRegion (markér i skabelon-tilstand)', () => {
  // 10x4 lærred med én 2x3-skabelon (række 0-1, kolonne 0-2)
  function withTemplate() {
    const p = newProject('Test', 10, 4)
    const want = new Array(40).fill(0)
    for (const i of [0, 1, 2, 10, 11, 12]) want[i] = 1
    const edges = edgesFromShape(10, 4, want)
    const shaped = { ...p, ...edges, shape: shapeFromEdges(10, 4, edges.hEdges, edges.vEdges).shape }
    return paintCells(shaped, 0, [[0, 2]], '#e11d48')
  }

  it('flytter en hel skabelon med kanter, farver og noter', () => {
    const p = addNote(withTemplate(), { id: 'n', r: 0, c: 0, text: 'Forstykke' })
    const next = moveRegion(p, findTemplates(p), { r0: 0, c0: 0, r1: 1, c1: 2 }, 1, 5)
    const list = findTemplates(next).list
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ r0: 1, c0: 5, r1: 2, c1: 7 })
    expect(next.colors[1 * 10 + 7]).toBe('#e11d48')
    expect(next.colors[2]).toBe(null)
    expect(next.notes[0]).toMatchObject({ r: 1, c: 5 })
  })

  it('opløser skabelonen når den klippes over, og samler den igen når delen flyttes tilbage', () => {
    const p = withTemplate()
    const sel = { r0: 0, c0: 2, r1: 1, c1: 2 }
    const split = moveRegion(p, findTemplates(p), sel, 0, 4)
    expect(shapeFromEdges(10, 4, split.hEdges, split.vEdges).closed).toBe(false) // ingen lukket skabelon tilbage
    expect(split.layers[0].colors[6]).toBe('#e11d48') // farven er flyttet med og bevaret
    const back = moveRegion(split, findTemplates(split), { r0: 0, c0: 6, r1: 1, c1: 6 }, 0, -4)
    const list = findTemplates(back).list
    expect(list).toHaveLength(1)
    expect(list[0].cells).toHaveLength(6)
    expect(back.colors[2]).toBe('#e11d48')
  })

  it('lader en nabo-skabelons fælles kant stå', () => {
    let p = withTemplate()
    // nabo: 2x2 lige til højre (kolonne 3-4) – deler kanten ved c=3
    const want = p.shape.slice()
    for (const i of [3, 4, 13, 14]) want[i] = 1
    const e = edgesFromShape(10, 4, want)
    const vEdges = e.vEdges.slice()
    vEdges[vIdx(10, 0, 3)] = vEdges[vIdx(10, 1, 3)] = 1
    p = { ...p, hEdges: e.hEdges, vEdges, shape: shapeFromEdges(10, 4, e.hEdges, vEdges).shape }
    expect(findTemplates(p).list).toHaveLength(2)
    const next = moveRegion(p, findTemplates(p), { r0: 0, c0: 0, r1: 1, c1: 2 }, 2, 0)
    const list = findTemplates(next).list
    expect(list).toHaveLength(2)
    expect(list.map((t) => t.cells.length).sort()).toEqual([4, 6])
  })
})

describe('countRegion', () => {
  it('tæller rækker, masker og farver indenfor skabelonen', () => {
    const p = paintCells(project(), 0, [[0, 3], [1, 4]], '#e11d48')
    const n = countRegion(p, { r0: 0, c0: 2, r1: 1, c1: 5 })
    expect(n).toMatchObject({ rows: 2, stitches: 4, inside: 6, rowsInside: 2, stitchesInside: 3 })
    expect(n.colors).toEqual([
      { hex: null, count: 4 },
      { hex: '#e11d48', count: 2 },
    ])
  })
})
