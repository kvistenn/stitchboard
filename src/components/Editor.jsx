import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridCanvas from './GridCanvas'
import NotesLayer from './NotesLayer'
import LayersPanel from './LayersPanel'
import TemplatesPanel from './TemplatesPanel'
import ReplaceColorPanel from './ReplaceColorPanel'
import MirrorPanel from './MirrorPanel'
import ImageOverlay from './ImageOverlay'
import ImagePanel from './ImagePanel'
import ColorBar from './ColorBar'
import CanvasSizeDialog from './CanvasSizeDialog'
import KnitPanel, { useKnitState } from './KnitPanel'
import SymbolBar from './SymbolBar'
import PoolingPanel from './PoolingPanel'
import DisplayDialog from './DisplayDialog'
import {
  floodFill,
  cropToTemplate,
  pushRecent,
  resizeProject,
  shapeFromEdges,
  emptyEdges,
  edgeStep,
  moveCells,
  moveRegion,
  copyArea,
  pasteArea,
  countRegion,
  colorName,
  findTemplates,
  moveTemplate,
  deleteTemplate,
  copyRegion,
  pasteRegion,
  pasteSheet,
  copyTemplate,
  pasteTemplate,
  findTemplateSpot,
  addNote,
  updateNote,
  removeNote,
  uid,
  ensureLayers,
  hasValidLayers,
  layerIndexById,
  paintCells,
  clearLayer,
  addLayer,
  duplicateLayer,
  removeLayer,
  moveLayerOrder,
  toggleLayer,
  renameLayer,
  shiftLayer,
  mergeLayerDown,
  replaceColor,
  shiftSelection,
  selectionCells,
  selectionRects,
  cellsSelection,
  layerBounds,
  mirrorCells,
  mirrorRegion,
  mirrorCopyCells,
  mirrorCopyArea,
  rotateCells,
  rotateRegion,
  insertPixels,
  hasDraftOutside,
  hIdx,
  vIdx,
  paintSymbols,
  symbolsOf,
} from '../state'
import { downloadJSON } from '../storage'
import { applyPooling, defaultPooling, plannedPooling, widestRow } from '../pooling'
import { loadDisplay, saveDisplay, edgeLineWidth } from '../display'
import { symbolById } from '../symbols'
import { contrastColor } from '../colors'
import { parseSheetHTML } from '../sheets'
import { quantizeCells } from '../colors'
import { loadImage, sampleImage } from '../imageTools'
import {
  Pen,
  Eraser,
  Rect,
  Bucket,
  Select,
  Hand,
  Undo,
  Redo,
  Plus,
  Minus,
  Back,
  Download,
  Image,
  Grid,
  Trash,
  Border,
  Note,
  Ruler,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  Stitch,
  Sliders,
} from './Icons'

const MODES = [
  { id: 'template', n: 1, label: 'Skabelon' },
  { id: 'pattern', n: 2, label: 'Mønster' },
  { id: 'knit', n: 3, label: 'Strik' },
]

// Udklipsholder på modulniveau, så en kopi kan sættes ind i et andet projekt i samme session
let clipboard = null
// Lægges på systemets udklipsholder når man kopierer i appen, så Ctrl+V bagefter indsætter appens kopi –
// og ikke en tabel fra Google Sheets, der lå der fra før
const CLIP_MARKER = 'stitchboard-kopi'

// Sammenklappet infopanel på mobil, husket pr. tilstand (Strik starter foldet ud)
const PANEL_KEY = 'stitchboard.panel'
// Farvebjælkens placering: 'bottom' (flydende nederst) eller 'side' (ved værktøjsbjælken)
const COLOR_DOCK_KEY = 'stitchboard.colorDock'
// Højre panel minimeret på desktop – fælles for alle tilstande, adskilt fra mobilens fold-ud
const PANEL_MIN_KEY = 'stitchboard.panelMinimized'
function readPanelMinimized() {
  try {
    return localStorage.getItem(PANEL_MIN_KEY) === '1'
  } catch {
    return false
  }
}
function readColorDock() {
  try {
    return localStorage.getItem(COLOR_DOCK_KEY) === 'side' ? 'side' : 'bottom'
  } catch {
    return 'bottom'
  }
}
function readPanelOpen() {
  try {
    return { template: false, pattern: false, knit: true, ...JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') }
  } catch {
    return { template: false, pattern: false, knit: true }
  }
}

export default function Editor({ project, onChange, onBack }) {
  const [mode, setMode] = useState('template')
  const [tool, setTool] = useState('pen')
  const [cellSize, setCellSize] = useState(18)
  const [history, setHistory] = useState({ past: [], future: [] })
  const [cursor, setCursor] = useState(null) // sidst udfyldte felt [r,c] i mønster-tilstand
  const [selection, setSelection] = useState(null) // markering {r0,c0,r1,c1,rects?} (Markér-værktøjet, se selectionFromRects)
  const [measure, setMeasure] = useState(null) // område der tælles {r0,c0,r1,c1,rects?} (Tæl-værktøjet)
  const [tplCell, setTplCell] = useState(null) // et felt i den valgte skabelon (skabelon-tilstand)
  const [edgeCursor, setEdgeCursor] = useState(null) // gitterhjørne [r,c] hvor sidste kant endte (skabelon-tilstand)
  const [clip, setClipState] = useState(() => clipboard)
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const [colorDock, setColorDock] = useState(readColorDock)
  const [panelMinimized, setPanelMinimized] = useState(readPanelMinimized)
  // en ny note ligger her indtil den får tekst – så en tom note aldrig ender i projektet eller historikken
  const [draftNote, setDraftNote] = useState(null)
  const [noteFocus, setNoteFocus] = useState(null) // {id, n}: noten der skal have fokus (n giver fokus igen)
  const [sizeOpen, setSizeOpen] = useState(false) // dialogen til lærredets størrelse
  const [rowLocked, setRowLocked] = useState(false) // strik: tryk på lærredet skifter ikke række (mobil)
  const [symbol, setSymbol] = useState('purl') // strikkesymbolet Symbol-værktøjet sætter
  const [display, setDisplayState] = useState(loadDisplay) // visningsindstillinger (huskes i browseren)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [poolLayerId, setPoolLayerId] = useState(null) // laget planned pooling sidst blev lagt på
  // indsat billede i mønster-tilstand, indtil det pixeleres: { url, img, r0, c0, w, h, keep, opacity, count, ... }
  const [image, setImage] = useState(null)
  const imageFileRef = useRef(null)
  // projekter uden (gyldige) lag – fra før lagene, eller hentet igen fra serveren mens editoren er åben –
  // vises som ét lag med det samme; konverteringen gemmes i effekten nedenfor
  const view = useMemo(() => (hasValidLayers(project) ? project : ensureLayers(project)), [project])
  const layers = view.layers
  // det aktive lag huskes på id, så det følger laget ved fortryd og ændret rækkefølge (ukendt id = øverste lag)
  const [activeLayerId, setActiveLayerId] = useState(null)
  const active = layerIndexById(layers, activeLayerId)
  const layerHidden = !layers[active].visible
  const scrollRef = useRef(null)
  // de enkelte lukkede skabeloner på lærredet (fx for- og bagside)
  const templates = useMemo(
    () => findTemplates(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.cols, project.rows, project.shape, project.hEdges, project.vEdges],
  )
  const knit = useKnitState(project, templates)
  // den valgte skabelon findes ud fra et af dens felter, fordi nøglerne skifter når skabeloner ændres
  const activeTemplate = useMemo(() => {
    if (tplCell === null) return null
    const k = templates.comp[tplCell]
    const t = k >= 0 ? templates.list[k] : null
    return t && t.cells.length < project.cols * project.rows ? t : null
  }, [tplCell, templates, project.cols, project.rows])

  // skift standardværktøj når tilstand skifter
  useEffect(() => {
    setTool(mode === 'template' ? 'edge' : 'pen')
    setCursor(null)
    setEdgeCursor(null)
    setSelection(null)
    setMeasure(null)
    setTplCell(null)
    setDraftNote(null)
    setImage((img) => {
      if (img) URL.revokeObjectURL(img.url)
      return null
    })
  }, [mode])

  // markeringen hører kun til markeringsværktøjet
  useEffect(() => {
    if (tool !== 'select') setSelection(null)
    if (tool !== 'count') setMeasure(null)
    if (tool !== 'hand') setTplCell(null)
    if (tool !== 'edge' && tool !== 'rect') setEdgeCursor(null)
  }, [tool])

  // ---- historik ------------------------------------------------------
  const snap = (p) => ({
    shape: p.shape,
    colors: p.colors,
    layers: p.layers,
    hEdges: p.hEdges,
    vEdges: p.vEdges,
    notes: p.notes || [],
    symbols: p.symbols,
    cols: p.cols,
    rows: p.rows,
    focus: p.knit?.focus,
  })
  // de valgte skabeloner i strikkevisningen er feltnumre – de følger kun med når lærredets størrelse fortrydes
  const restore = (p, { focus, ...s }) =>
    s.cols !== p.cols || s.rows !== p.rows ? { ...p, ...s, knit: p.knit && { ...p.knit, focus } } : { ...p, ...s }
  const commit = useCallback(
    (next) => {
      setHistory((h) => ({
        past: [...h.past.slice(-49), snap(project)],
        future: [],
      }))
      onChange(next)
    },
    [project, onChange],
  )
  const undo = useCallback(() => {
    if (!history.past.length) return
    const prev = history.past[history.past.length - 1]
    setHistory({
      past: history.past.slice(0, -1),
      future: [snap(project), ...history.future],
    })
    onChange(restore(project, prev))
  }, [history, project, onChange])
  const redo = useCallback(() => {
    if (!history.future.length) return
    const nxt = history.future[0]
    setHistory({
      past: [...history.past, snap(project)],
      future: history.future.slice(1),
    })
    onChange(restore(project, nxt))
  }, [history, project, onChange])

  // Seneste projekt i en ref, så hurtige pointer-events under et strøg bygger videre på hinanden
  const projectRef = useRef(project)
  projectRef.current = project

  // seneste projekt, altid med lag (også i første render af et gammelt projekt)
  const cur = () => {
    const p = projectRef.current
    return hasValidLayers(p) ? p : ensureLayers(p)
  }

  // projekter uden gyldige lag konverteres – uden at komme i fortryd-historikken
  useEffect(() => {
    if (view !== project) onChange(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // ---- tegning ---------------------------------------------------------
  // GridCanvas tegner strøget lokalt og kalder først her når man slipper – så ét commit pr. strøg
  const applyCells = useCallback(
    (cells) => {
      if (!cells.length || layerHidden) return
      const p = cur()
      setCursor(cells[cells.length - 1])
      const v = tool === 'eraser' ? null : p.currentColor
      if (tool !== 'eraser' && !v) return // ingen farve valgt
      // også udenfor skabelonen – der kan man tegne et mønster og trække det ind bagefter
      commit(paintCells(p, active, cells, v))
    },
    [tool, commit, active, layerHidden],
  )

  // Symbol-værktøjet: symbolerne ligger ikke på lagene, så de kan sættes selvom laget er skjult
  const applySymbols = useCallback(
    (cells, id) => {
      if (cells.length) commit(paintSymbols(cur(), cells, id))
    },
    [commit],
  )

  // kant-pennen og rektanglet (skabelon-tilstand); corner bliver markøren piletasterne tegner videre fra
  const applyEdges = useCallback(
    (edges, value, corner) => {
      const p = projectRef.current
      if (corner) setEdgeCursor(corner)
      const hEdges = p.hEdges.slice()
      const vEdges = p.vEdges.slice()
      for (const e of edges) {
        if (e.type === 'h') hEdges[hIdx(p.cols, e.r, e.c)] = value
        else vEdges[vIdx(p.cols, e.r, e.c)] = value
      }
      const { shape } = shapeFromEdges(p.cols, p.rows, hEdges, vEdges)
      commit({ ...p, hEdges, vEdges, shape })
    },
    [commit],
  )

  // piletaster i skabelon-tilstand: tegn kanten fra markør-hjørnet (Shift = flyt uden at tegne, Alt = fjern kanten)
  const edgeWithArrow = useCallback(
    (e) => {
      if (!edgeCursor) return false
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
      if (!d) return false
      const p = projectRef.current
      const step = edgeStep(p.cols, p.rows, edgeCursor, d[0], d[1])
      if (!step) return true // ved kanten af gridet: sluk tasten, men gør intet
      if (e.shiftKey) setEdgeCursor(step.corner)
      else applyEdges([step.edge], e.altKey ? 0 : 1, step.corner)
      return true
    },
    [edgeCursor, applyEdges],
  )

  const setAllEdges = (fn) => {
    const { hEdges, vEdges } = fn(project)
    const { shape } = shapeFromEdges(project.cols, project.rows, hEdges, vEdges)
    commit({ ...project, hEdges, vEdges, shape })
  }
  const clearEdges = () => setAllEdges((p) => emptyEdges(p.cols, p.rows))
  const frameEdges = () =>
    setAllEdges((p) => {
      const { hEdges, vEdges } = emptyEdges(p.cols, p.rows)
      for (let c = 0; c < p.cols; c++) hEdges[hIdx(p.cols, 0, c)] = hEdges[hIdx(p.cols, p.rows, c)] = 1
      for (let r = 0; r < p.rows; r++) vEdges[vIdx(p.cols, r, 0)] = vEdges[vIdx(p.cols, r, p.cols)] = 1
      return { hEdges, vEdges }
    })
  const templateInfo = useMemo(
    () => shapeFromEdges(project.cols, project.rows, project.hEdges, project.vEdges),
    [project.cols, project.rows, project.hEdges, project.vEdges],
  )

  // er der kladde udenfor skabelonen, som kan beskæres væk?
  const hasOutside = useMemo(() => !!project.layers && hasDraftOutside(project), [project])

  // flyt rundt: træk en hel skabelon til et nyt sted på lærredet
  const applyMoveTemplate = useCallback(
    (t, dr, dc) => {
      const p = cur()
      const next = moveTemplate(p, templates, t, dr, dc)
      if (next === p) return // overlapper en anden skabelon – intet flyttes
      // skabelonens nøgle er dens første felt, som flytter med
      const focus = (p.knit.focus || []).map((k) => (k === t.key ? k + dr * p.cols + dc : k))
      commit({ ...next, knit: { ...p.knit, focus } })
      setTplCell(t.key + dr * p.cols + dc) // den flyttede skabelon er valgt
    },
    [templates, commit],
  )

  // ny størrelse på lærredet – markeringer o.l. peger på de gamle felter og nulstilles
  const applyResize = (cols, rows, dr, dc) => {
    commit(resizeProject(cur(), cols, rows, dr, dc))
    setSizeOpen(false)
    setSelection(null)
    setMeasure(null)
    setTplCell(null)
    setEdgeCursor(null)
    setCursor(null)
  }

  // slet en skabelon (krydset ved den valgte skabelon, skraldespanden i listen eller Delete)
  const removeTemplate = useCallback(
    (t) => {
      commit(deleteTemplate(cur(), templates, t))
      setTplCell(null)
    },
    [templates, commit],
  )
  // dupliker en skabelon: kopien lægges ved siden af (ellers nedenunder) og bliver valgt
  const duplicateTemplate = useCallback(
    (t) => {
      const p = cur()
      const c = copyTemplate(p, t)
      const spot = findTemplateSpot(p, c)
      if (!spot) {
        alert('Ikke plads til kopien – gør lærredet større.')
        return
      }
      const [r, col] = spot
      commit(pasteTemplate(p, c, r, col))
      setTool('hand')
      setTplCell((r + c.cells[0].r) * p.cols + col + c.cells[0].c)
    },
    [commit],
  )
  // skabeloner der kan vælges – ikke "hele gridet" mens kanten endnu ikke er lukket
  const realTemplates = useMemo(
    () => templates.list.filter((t) => t.cells.length < project.cols * project.rows),
    [templates, project.cols, project.rows],
  )
  const pickTemplate = (t) => {
    setTool('hand')
    setTplCell(t.key)
  }

  const applyRect = useCallback(
    (r0, c0, r1, c1) => {
      const cells = []
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
        for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) cells.push([r, c])
      applyCells(cells)
    },
    [applyCells],
  )

  const applyFill = useCallback(
    (r, c) => {
      if (layerHidden) return
      const p = cur()
      if (!p.currentColor) return
      setCursor([r, c])
      commit(floodFill(p, r, c, p.currentColor, active))
    },
    [commit, active, layerHidden],
  )

  // piletaster: udfyld nabofeltet ud fra det sidst udfyldte felt (Shift = spring feltet over uden at farve det)
  const paintWithArrow = useCallback(
    (e) => {
      if (!cursor) return false
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
      if (!d) return false
      const p = projectRef.current
      const r = cursor[0] + d[0]
      const c = cursor[1] + d[1]
      if (r < 0 || c < 0 || r >= p.rows || c >= p.cols) return true
      if (e.shiftKey) setCursor([r, c])
      else applyCells([[r, c]])
      return true
    },
    [cursor, applyCells],
  )

  // markering: flyt indholdet dr/dc felter (holdes indenfor gridet).
  // I skabelon-tilstand flyttes kanter, farver på alle lag og noter – en overklippet skabelon opløses.
  const moveSelection = useCallback(
    (dr, dc) => {
      if (!selection) return
      if (mode === 'pattern' && layerHidden) return
      const p = cur()
      dr = Math.max(-selection.r0, Math.min(p.rows - 1 - selection.r1, dr))
      dc = Math.max(-selection.c0, Math.min(p.cols - 1 - selection.c1, dc))
      if (!dr && !dc) return
      commit(mode === 'template' ? moveRegion(p, templates, selection, dr, dc) : moveCells(p, selection, dr, dc, active))
      setSelection(shiftSelection(selection, dr, dc))
    },
    [selection, commit, active, layerHidden, mode, templates],
  )
  const counted = useMemo(() => (measure ? countRegion(project, measure) : null), [measure, project])
  const clearSelection = useCallback(() => {
    if (!selection || layerHidden) return
    commit(paintCells(cur(), active, selectionCells(selection), null))
  }, [selection, commit, active, layerHidden])

  // Flyt rundt i mønster-tilstand: flyt hele det aktive lag
  const applyShiftLayer = useCallback(
    (dr, dc) => {
      if (layerHidden) return
      const p = cur()
      const next = shiftLayer(p, active, dr, dc)
      if (next !== p) commit(next)
    },
    [commit, active, layerHidden],
  )

  // ---- spejlvend -----------------------------------------------------------
  // det der spejles: markeringen – ellers den valgte skabelon (skabelon-tilstand) eller alt på det aktive lag
  const mirrorTarget = useMemo(() => {
    if (selection) return { sel: selection, label: 'markeringen' }
    if (mode === 'template' && activeTemplate)
      return { sel: cellsSelection(activeTemplate.cells, project.cols), label: activeTemplate.name }
    if (mode === 'pattern') {
      const b = layerBounds(layers[active].colors, project.cols)
      if (b) return { sel: b, label: `alt på "${layers[active].name}"` }
    }
    return null
  }, [selection, mode, activeTemplate, layers, active, project.cols])

  const applyFlip = (axis) => {
    if (!mirrorTarget || (mode === 'pattern' && layerHidden)) return
    const p = cur()
    const { sel } = mirrorTarget
    const res = mode === 'template' ? mirrorRegion(p, templates, sel, axis) : mirrorCells(p, sel, axis, active)
    commit(res.project)
    if (selection) setSelection(res.sel)
    // den spejlvendte skabelon er stadig valgt – via et felt der ligger i den efter spejlingen
    else if (mode === 'template') {
      const f = selectionRects(res.sel)[0]
      setTplCell(f.r0 * p.cols + f.c0)
    }
  }

  // rotér 90° om midten – samme mål som spejlvend
  const applyRotate = (dir) => {
    if (!mirrorTarget || (mode === 'pattern' && layerHidden)) return
    const p = cur()
    const { sel } = mirrorTarget
    const res = mode === 'template' ? rotateRegion(p, templates, sel, dir) : rotateCells(p, sel, dir, active)
    if (!res) {
      alert('Der er ikke plads til at rotere på lærredet – gør lærredet større.')
      return
    }
    commit(res.project)
    if (selection) setSelection(res.sel)
    // den roterede skabelon er stadig valgt – via et felt der ligger i den efter rotationen
    else if (mode === 'template') {
      const f = selectionRects(res.sel)[0]
      setTplCell(f.r0 * p.cols + f.c0)
    }
  }

  const applyMirrorCopy = (side) => {
    if (!mirrorTarget || (mode === 'pattern' && layerHidden)) return
    const p = cur()
    const { sel } = mirrorTarget
    const res = mode === 'template' ? mirrorCopyArea(p, sel, side) : mirrorCopyCells(p, sel, side, active)
    if (!res) {
      alert('Der er ikke plads til kopien på den side – gør lærredet større.')
      return
    }
    commit(res.project)
    // original og kopi bliver markeret, så man kan spejle videre – fx først til højre og så nedad
    if (selection) setSelection(res.sel)
  }

  // ---- billede -------------------------------------------------------------
  // billedet lægges ved markeringen (tilpasset den) – ellers midt på lærredet, højst 40 masker bredt
  const startImage = async (file) => {
    if (!file) return
    if (mode !== 'pattern') setMode('pattern')
    let loaded
    try {
      loaded = await loadImage(file)
    } catch (err) {
      alert(err.message)
      return
    }
    const { img, url } = loaded
    const p = cur()
    const ratio = img.naturalHeight / img.naturalWidth
    const box = selection
      ? { w: selection.c1 - selection.c0 + 1, h: selection.r1 - selection.r0 + 1 }
      : { w: Math.min(p.cols, 40), h: p.rows }
    let w = box.w
    let h = Math.max(1, Math.round(w * ratio))
    if (h > box.h) {
      h = box.h
      w = Math.max(1, Math.round(h / ratio))
    }
    const r0 = selection ? selection.r0 : Math.max(0, Math.floor((p.rows - h) / 2))
    const c0 = selection ? selection.c0 : Math.max(0, Math.floor((p.cols - w) / 2))
    setImage((old) => {
      if (old) URL.revokeObjectURL(old.url)
      const keep = old ? { count: old.count, paletteOnly: old.paletteOnly } : { count: 8, paletteOnly: false }
      return { url, img, r0, c0, w, h, keep: true, opacity: 0.7, preview: false, insideOnly: false, ...keep }
    })
    setSelection(null)
    setCursor(null)
  }
  const changeImage = (patch) => setImage((img) => img && { ...img, ...patch })
  const cancelImage = () => {
    if (image) URL.revokeObjectURL(image.url)
    setImage(null)
  }
  const pixelate = (img) => {
    const cells = sampleImage(img.img, img.w, img.h)
    return quantizeCells(cells, img.count, img.paletteOnly ? project.palette.map((x) => x.hex) : null)
  }
  // forhåndsvisning som felter – kun når den er slået til, for det koster at måle billedet
  const imagePreview = useMemo(
    () => (image?.preview ? pixelate(image) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image?.preview, image?.img, image?.w, image?.h, image?.count, image?.paletteOnly, project.palette],
  )
  const applyImage = () => {
    if (!image) return
    const p = cur()
    const { project: next, layerId } = insertPixels(p, {
      r0: image.r0,
      c0: image.c0,
      w: image.w,
      h: image.h,
      hexes: imagePreview || pixelate(image),
      index: active,
      insideOnly: image.insideOnly && templateInfo.closed,
      addColors: !image.paletteOnly,
    })
    commit(next)
    setActiveLayerId(layerId)
    cancelImage()
  }

  // ---- planned pooling -------------------------------------------------------
  // området garnet lægges ud i: markeringen – ellers skabelonen, eller hele lærredet hvis kanten ikke er lukket
  const poolArea = useMemo(() => {
    if (mode !== 'pattern') return null
    const n = project.cols * project.rows
    if (selection) {
      const mask = new Uint8Array(n)
      for (const [r, c] of selectionCells(selection)) mask[r * project.cols + c] = 1
      return { mask, label: 'markeringen' }
    }
    if (templateInfo.closed) return { mask: project.shape, label: 'skabelonen' }
    return { mask: new Uint8Array(n).fill(1), label: 'hele lærredet' }
  }, [mode, selection, templateInfo.closed, project.shape, project.cols, project.rows])
  const pooling = project.pooling || defaultPooling(project)
  const poolingUpdates = poolLayerId !== null && layers[active].id === poolLayerId
  const applyPlannedPooling = () => {
    if (!poolArea) return
    const p = cur()
    const colors = plannedPooling(p, poolArea.mask, {
      ...pooling,
      startFrom: p.knit.startFrom,
      firstSide: p.knit.firstSide,
    })
    if (!colors) return
    const res = applyPooling({ ...p, pooling }, colors, active, poolingUpdates ? poolLayerId : null)
    commit(res.project)
    setActiveLayerId(res.layerId)
    setPoolLayerId(res.layerId)
  }

  // ---- visning -------------------------------------------------------------
  const setDisplay = (d) => {
    setDisplayState(d)
    saveDisplay(d)
  }
  // noternes tekst skal kunne læses på feltets farve
  const noteColor = (r, c) => {
    const i = r * view.cols + c
    if (i < 0 || i >= view.colors.length) return undefined
    return contrastColor(view.shape[i] ? view.colors[i] || '#ffffff' : view.colors[i] || '#e9ecf1')
  }

  // ---- kopiér / indsæt ---------------------------------------------------
  const setClip = (c) => {
    clipboard = c
    setClipState(c)
  }
  // returnerer om der blev kopieret noget
  const copy = useCallback(() => {
    const p = cur()
    let c = null
    if (mode === 'pattern' && selection) c = copyRegion(p, selection, active)
    // skabelon-tilstand: markeringen hvis der er en, ellers den valgte skabelon
    if (mode === 'template' && selection) c = copyArea(p, selection)
    else if (mode === 'template' && activeTemplate) c = copyTemplate(p, activeTemplate)
    if (c) setClip(c)
    return !!c
  }, [mode, selection, activeTemplate, active])
  // knapperne har ikke en copy-hændelse, så markøren skrives direkte (kan afvises af browseren – så må det være)
  const copyButton = () => {
    if (copy()) navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {})
  }
  const paste = useCallback(() => {
    const p = cur()
    if (mode === 'pattern' && clip?.kind === 'pattern') {
      if (layerHidden) return
      // ved markeringen, ved markøren – ellers lidt forskudt fra originalen
      const [r, c] = selection ? [selection.r0, selection.c0] : cursor || [clip.r0 + 2, clip.c0 + 2]
      const { project: next, sel } = pasteRegion(p, clip, r, c, active)
      commit(next)
      setCursor(null)
      setTool('select')
      setSelection(sel)
    }
    if (mode === 'template' && clip?.kind === 'area') {
      // ved markeringen – men står den stadig på originalen, lægges kopien til højre for den (ellers nedenunder)
      const onOriginal = !selection || (selection.r0 === clip.r0 && selection.c0 === clip.c0)
      let [r, c] = onOriginal ? [clip.r0, clip.c0 + clip.w + 2] : [selection.r0, selection.c0]
      if (onOriginal && c + clip.w > p.cols) [r, c] = [clip.r0 + clip.h + 2, clip.c0]
      const { project: next, sel } = pasteArea(p, clip, r, c)
      commit(next)
      setTool('select')
      setSelection(sel) // kopien er markeret, så den kan trækkes på plads
      return
    }
    if (mode === 'template' && clip?.kind === 'template') {
      // ved siden af den valgte skabelon, ellers ved siden af originalen
      const from = activeTemplate ? { ...clip, r0: activeTemplate.r0, c0: activeTemplate.c0 } : clip
      const spot = findTemplateSpot(p, from)
      if (!spot) {
        alert('Ikke plads til kopien – gør lærredet større.')
        return
      }
      const [r, c] = spot
      commit(pasteTemplate(p, clip, r, c))
      setTool('hand')
      setTplCell((r + clip.cells[0].r) * p.cols + c + clip.cells[0].c)
    }
  }, [mode, clip, selection, cursor, activeTemplate, commit, active, layerHidden])

  // mønster fra Google Sheets/Excel: farverne på det aktive lag, tekst som noter – ved markeringen,
  // ved markøren eller i øverste venstre hjørne
  const pasteFromSheet = useCallback(
    (sheet) => {
      if (layerHidden) {
        alert(`"${layers[active].name}" er skjult – slå laget til for at indsætte mønsteret.`)
        return
      }
      const [r, c] = selection ? [selection.r0, selection.c0] : (mode === 'pattern' && cursor) || [0, 0]
      const { project: next, sel } = pasteSheet(cur(), sheet, r, c, active)
      commit(next)
      setCursor(null)
      setTool('select')
      setSelection(sel)
    },
    [selection, cursor, mode, commit, active, layerHidden, layers],
  )

  // Ctrl+C / Ctrl+V går gennem browserens copy/paste-hændelser – kun dér kan man læse HTML fra udklipsholderen
  useEffect(() => {
    if (mode === 'knit') return
    const editing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable
    const onCopy = (e) => {
      if (editing(e) || !copy()) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', CLIP_MARKER)
    }
    const onPaste = (e) => {
      if (editing(e)) return
      e.preventDefault()
      const data = e.clipboardData
      const file = [...(data?.files || [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        startImage(file)
        return
      }
      const sheet = data && data.getData('text/plain') !== CLIP_MARKER ? parseSheetHTML(data.getData('text/html')) : null
      if (sheet?.cells.length) pasteFromSheet(sheet)
      else paste()
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, copy, paste, pasteFromSheet, selection])

  // ---- noter ----------------------------------------------------------------
  const focusNote = (id) => setNoteFocus((f) => ({ id, n: (f?.n || 0) + 1 }))
  const addNoteAt = useCallback((r, c) => {
    const id = uid()
    setDraftNote({ id, r, c, text: '' })
    focusNote(id)
  }, [])
  // Enter/Tab i en note: gå til feltet (r,c) – står der en note, får den fokus, ellers startes en ny
  const goToNoteCell = useCallback(
    (r, c) => {
      const p = projectRef.current
      if (r < 0 || c < 0 || r >= p.rows || c >= p.cols) return
      const there = (p.notes || []).find((n) => n.r === r && n.c === c)
      if (there) focusNote(there.id)
      else addNoteAt(r, c)
    },
    [addNoteAt],
  )
  const changeNote = useCallback(
    (id, patch) => {
      if (draftNote?.id === id) {
        // kladden bliver en rigtig note så snart den får tekst
        const next = { ...draftNote, ...patch }
        if (next.text.trim()) {
          commit(addNote(projectRef.current, next))
          setDraftNote(null)
        } else setDraftNote(next)
        return
      }
      commit(updateNote(projectRef.current, id, patch))
    },
    [draftNote, commit],
  )
  const deleteNote = useCallback(
    (id) => {
      if (draftNote?.id === id) return setDraftNote(null)
      if ((projectRef.current.notes || []).some((n) => n.id === id)) commit(removeNote(projectRef.current, id))
    },
    [draftNote, commit],
  )
  const shownNotes = draftNote ? [...(project.notes || []), draftNote] : project.notes || []

  // ---- lag -----------------------------------------------------------------
  const layerActions = {
    onSelect: (k) => setActiveLayerId(layers[k].id),
    onToggle: (k) => commit(toggleLayer(cur(), k)),
    onRename: (k, name) => {
      const p = cur()
      const next = renameLayer(p, k, name)
      if (next !== p) commit(next)
    },
    onMove: (k, delta) => {
      const p = cur()
      const next = moveLayerOrder(p, k, delta)
      if (next === p) return
      commit(next) // det aktive lag følger med via sit id
    },
    onRemove: (k) => {
      const p = cur()
      if (p.layers[k].colors.some(Boolean) && !confirm(`Slet "${p.layers[k].name}" og alt på det?`)) return
      commit(removeLayer(p, k))
      if (k === active) setActiveLayerId(p.layers[Math.max(0, k - 1)].id) // laget nedenunder bliver aktivt
    },
    onAdd: () => {
      const next = addLayer(cur(), active)
      commit(next)
      setActiveLayerId(next.layers[active + 1].id)
    },
    onDuplicate: () => {
      const next = duplicateLayer(cur(), active)
      commit(next)
      setActiveLayerId(next.layers[active + 1].id)
    },
    // det aktive lag flettes ned i laget under, som så bliver det aktive
    onMergeDown: () => {
      const p = cur()
      if (active <= 0) return
      const below = p.layers[active - 1]
      commit(mergeLayerDown(p, active))
      setActiveLayerId(below.id)
    },
  }

  // erstat farve i mønster-tilstand – på alle lag eller kun det aktive, og kun i markeringen hvis der er en
  const applyReplaceColor = (from, to, onlyActive) => {
    const p = cur()
    const next = replaceColor(p, from, to, onlyActive ? active : null, selection)
    if (next !== p) commit(next)
  }

  const changeColorDock = (dock) => {
    setColorDock(dock)
    try {
      localStorage.setItem(COLOR_DOCK_KEY, dock)
    } catch {
      // privat vindue o.l. – placeringen huskes bare ikke
    }
  }

  // samme bjælke bruges begge steder – kun placeringen skifter
  // Symbol-værktøjet har sin egen bjælke med symbolerne i stedet for farverne
  const colorBar = mode === 'pattern' && tool !== 'symbol' && (
    <ColorBar
      project={project}
      onSelect={(hex, base) => {
        selectColor(hex, base)
        if (['eraser', 'select', 'hand', 'count'].includes(tool)) setTool('pen')
      }}
      onChange={onChange}
      dock={colorDock}
      onDock={changeColorDock}
    />
  )

  const toggleMinimized = () => {
    const next = !panelMinimized
    setPanelMinimized(next)
    try {
      localStorage.setItem(PANEL_MIN_KEY, next ? '1' : '0')
    } catch {
      // privat vindue o.l. – valget huskes bare ikke
    }
  }

  const togglePanel = () => {
    const next = { ...panelOpen, [mode]: !panelOpen[mode] }
    setPanelOpen(next)
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(next))
    } catch {
      // privat vindue o.l. – panelet husker bare ikke valget
    }
  }

  const selectColor = (hex, base = project) => {
    onChange({ ...base, currentColor: hex, recent: pushRecent(base.recent, hex) })
  }

  // ---- strik -------------------------------------------------------------
  const onKnit = (k) => onChange({ ...project, knit: k })
  const gotoKnitRow = (k) => onKnit({ ...project.knit, row: Math.max(0, Math.min(knit.total - 1, k)), seg: 0 })
  const knitCellClick = (r, c) => {
    if (rowLocked) return
    const i = r * project.cols + c
    for (const track of knit.plan.tracks) {
      if (!track.mask[i]) continue
      const k = track.rows.indexOf(r)
      if (k >= 0) onKnit({ ...project.knit, row: k, seg: 0 })
      return
    }
  }
  const highlight = useMemo(() => {
    if (mode !== 'knit' || !knit.total) return null
    const { cols } = project
    // felterne fra første til sidste maske i sporets række
    const span = (mask, r) => {
      let c0 = -1
      let c1 = -1
      for (let c = 0; c < cols; c++)
        if (mask[r * cols + c]) {
          if (c0 < 0) c0 = c
          c1 = c
        }
      return { r, c0, c1 }
    }
    const current = knit.parts.filter((p) => p.gridRow !== undefined).map((p) => span(p.track.mask, p.gridRow))
    const done = knit.parts.flatMap((p) => p.track.rows.slice(0, knit.rowIdx).map((r) => span(p.track.mask, r)))
    const seg = project.knit.stepBySegment ? knit.segs[knit.segIdx] : null
    const segSpan = seg
      ? { r: knit.parts[seg.part].gridRow, c0: Math.min(...seg.cols), c1: Math.max(...seg.cols) }
      : null
    const labels = knit.plan.tracks.flatMap((t) =>
      t.rows.map((r, k) => ({ r, c: t.c0, n: k + 1, current: k === knit.rowIdx })),
    )
    return { current, done, seg: segSpan, labels }
  }, [mode, knit, project])

  // rul den aktuelle række ind i midten af skærmen i strik-tilstand
  useEffect(() => {
    if (!highlight) return
    const outer = scrollRef.current?.querySelector('.canvas-scroll-outer')
    // canvas-stack er positioneret (pga. noterne), så dens offsetTop er den der passer til scroll-området
    const canvas = scrollRef.current?.querySelector('.canvas-stack')
    if (!outer || !canvas) return
    if (!highlight.current.length) return
    const y = canvas.offsetTop + 28 + highlight.current[0].r * cellSize + cellSize / 2
    const target = y - outer.clientHeight / 2
    if (Math.abs(outer.scrollTop - target) > outer.clientHeight * 0.3) {
      outer.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [highlight, cellSize])

  // ---- zoom + genveje -------------------------------------------------------
  const zoom = (d) => setCellSize((s) => Math.max(4, Math.min(48, s + d)))
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let acc = 0
    const h = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      // saml små scroll-trin (touchpad/pinch) og zoom roligt: ét trin pr. ~80 px
      acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
      const steps = Math.trunc(acc / 80)
      if (steps !== 0) {
        acc -= steps * 80
        zoom(-steps)
      }
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  useEffect(() => {
    const h = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault()
        redo()
        return
      }
      // kopiér/indsæt håndteres af copy/paste-hændelserne ovenfor
      if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'v')) return
      if (k === '1') setMode('template')
      if (k === '2') setMode('pattern')
      if (k === '3') setMode('knit')
      if (mode === 'knit') return
      if (k === 't') setTool('count')
      if (e.key === 'Escape') setMeasure(null)
      if (mode === 'template') {
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
        if (selection && d) {
          e.preventDefault()
          moveSelection(d[0], d[1])
          return
        }
        if (k === 'h') setTool('hand')
        if (k === 'b' || k === 'p' || k === 'k') setTool('edge')
        if (k === 'r' || k === 'u') setTool('rect')
        if (k === 'n') setTool('note')
        if (k === 'm') setTool('select')
        if ((tool === 'edge' || tool === 'rect') && edgeWithArrow(e)) {
          e.preventDefault()
          return
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeTemplate) {
          e.preventDefault()
          removeTemplate(activeTemplate)
          return
        }
        if (e.key === 'Escape') {
          setTplCell(null)
          setSelection(null)
          setEdgeCursor(null)
        }
        return
      }
      if (tool === 'hand') {
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
        if (d) {
          e.preventDefault()
          applyShiftLayer(d[0], d[1])
          return
        }
      }
      if (selection) {
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
        if (d) {
          e.preventDefault()
          moveSelection(d[0], d[1])
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          clearSelection()
          return
        }
      } else if (e.key.startsWith('Arrow') && paintWithArrow(e)) {
        e.preventDefault()
        return
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && cursor) {
        // ryd markør-feltet; markøren bliver stående så piletasterne kan bruges videre
        e.preventDefault()
        if (!layerHidden) commit(paintCells(cur(), active, [cursor], null))
        return
      }
      if (e.key === 'Escape') {
        setCursor(null)
        setSelection(null)
      }
      if (k === 'b' || k === 'p') setTool('pen')
      if (k === 'e') setTool('eraser')
      if (k === 'r' || k === 'u') setTool('rect')
      if (k === 'g') setTool('fill')
      if (k === 'm') setTool('select')
      if (k === 'h') setTool('hand')
      if (k === 's') setTool('symbol')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [
    mode,
    tool,
    undo,
    redo,
    paintWithArrow,
    edgeWithArrow,
    selection,
    moveSelection,
    clearSelection,
    cursor,
    commit,
    applyShiftLayer,
    active,
    layerHidden,
    activeTemplate,
    removeTemplate,
  ])

  // ---- eksport -----------------------------------------------------------------
  const exportPNG = () => {
    const cs = 20
    const canvas = document.createElement('canvas')
    canvas.width = project.cols * cs + 2
    canvas.height = project.rows * cs + 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let r = 0; r < project.rows; r++)
      for (let c = 0; c < project.cols; c++) {
        const i = r * project.cols + c
        if (!project.shape[i]) continue
        ctx.fillStyle = project.colors[i] || '#fff'
        ctx.fillRect(1 + c * cs, 1 + r * cs, cs, cs)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'
        ctx.strokeRect(1 + c * cs + 0.5, 1 + r * cs + 0.5, cs, cs)
      }
    // strikkesymbolerne i en farve der kan ses på feltet
    const symbols = symbolsOf(project)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbolById(symbols[i])
      if (!sym || !project.shape[i]) continue
      const color = contrastColor(project.colors[i] || '#ffffff')
      ctx.save()
      ctx.translate(1 + (i % project.cols) * cs, 1 + ((i / project.cols) | 0) * cs)
      ctx.scale(cs / 24, cs / 24)
      ctx.lineWidth = 2
      if (sym.fill) {
        ctx.fillStyle = color
        ctx.fill(new Path2D(sym.path))
      } else {
        ctx.strokeStyle = color
        ctx.stroke(new Path2D(sym.path))
      }
      ctx.restore()
    }
    ctx.strokeStyle = '#000'
    ctx.lineWidth = display.edgeWidth > 0 ? edgeLineWidth(display, cs) : 3
    ctx.lineCap = 'square'
    ctx.beginPath()
    for (let r = 0; r <= project.rows; r++)
      for (let c = 0; c < project.cols; c++)
        if (project.hEdges[hIdx(project.cols, r, c)]) {
          ctx.moveTo(1 + c * cs, 1 + r * cs)
          ctx.lineTo(1 + (c + 1) * cs, 1 + r * cs)
        }
    for (let r = 0; r < project.rows; r++)
      for (let c = 0; c <= project.cols; c++)
        if (project.vEdges[vIdx(project.cols, r, c)]) {
          ctx.moveTo(1 + c * cs, 1 + r * cs)
          ctx.lineTo(1 + c * cs, 1 + (r + 1) * cs)
        }
    ctx.stroke()
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${project.name || 'skabelon'}.png`
    a.click()
  }

  const toolDefs =
    mode === 'template'
      ? [
          { id: 'edge', icon: <Border />, label: 'Kant (K)' },
          { id: 'rect', icon: <Rect />, label: 'Rektangel (R)' },
          { id: 'select', icon: <Select />, label: 'Markér (M)' },
          { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
          { id: 'note', icon: <Note />, label: 'Note (N)' },
          { id: 'count', icon: <Ruler />, label: 'Tæl (T)' },
        ]
      : mode === 'pattern'
        ? [
            { id: 'pen', icon: <Pen />, label: 'Pensel (B)' },
            { id: 'eraser', icon: <Eraser />, label: 'Viskelæder (E)' },
            { id: 'rect', icon: <Rect />, label: 'Udfyld (R)' },
            { id: 'fill', icon: <Bucket />, label: 'Spand (G)' },
            { id: 'select', icon: <Select />, label: 'Markér (M)' },
            { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
            { id: 'symbol', icon: <Stitch />, label: 'Symbol (S)' },
            { id: 'count', icon: <Ruler />, label: 'Tæl (T)' },
          ]
        : []


  return (
    <div className="editor">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={onBack} title="Tilbage til oversigt">
            <Back />
          </button>
          <input
            className="title-input"
            value={project.name}
            onChange={(e) => onChange({ ...project, name: e.target.value })}
            aria-label="Projektnavn"
          />
        </div>
        <nav className="mode-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={'mode-tab' + (mode === m.id ? ' active' : '')}
              onClick={() => setMode(m.id)}
            >
              <span className="mode-num">{m.n}</span>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="icon-btn" onClick={undo} disabled={!history.past.length} title="Fortryd (Ctrl+Z)">
            <Undo />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!history.future.length} title="Gentag (Ctrl+Y)">
            <Redo />
          </button>
          <div className="sep" />
          <button
            className="btn ghost small size-btn"
            onClick={() => setDisplayOpen(true)}
            title="Visning: felter, gitter og kanter"
          >
            <Sliders /> <span>Visning</span>
          </button>
          <button
            className="btn ghost small size-btn"
            onClick={() => setSizeOpen(true)}
            title={`Lærredets størrelse: ${project.cols} × ${project.rows}`}
          >
            <Grid /> <span>Lærred</span>
          </button>
          <button className="btn ghost small" onClick={exportPNG} title="Gem som billede">
            <Image /> PNG
          </button>
          <button className="btn primary small" onClick={() => downloadJSON(project)} title="Gem fil">
            <Download /> Gem fil
          </button>
        </div>
      </header>

      <div className="workspace">
        {/* Værktøjsbjælke til venstre */}
        {toolDefs.length > 0 && (
          <aside className="toolrail">
            {toolDefs.map((t) => (
              <button
                key={t.id}
                className={'tool' + (tool === t.id ? ' active' : '')}
                onClick={() => setTool(t.id)}
                title={t.label}
              >
                {t.icon}
                <span>{t.label.replace(/\s*\(.*\)/, '')}</span>
              </button>
            ))}
          </aside>
        )}
        {colorDock === 'side' && colorBar}

        {/* Lærred */}
        <main className="canvas-area" ref={scrollRef}>
          <div className="canvas-scroll-outer">
            <div className="canvas-scroll">
              <div className="canvas-stack">
              <GridCanvas
              project={view}
              mode={mode}
              tool={tool}
              cellSize={cellSize}
              highlight={highlight}
              cursorCell={mode === 'pattern' ? cursor : null}
              edgeCursor={mode === 'template' ? edgeCursor : null}
              selection={mode !== 'knit' ? selection : null}
              measure={mode !== 'knit' ? measure : null}
              onMeasure={setMeasure}
              templates={templates}
              onMoveTemplate={applyMoveTemplate}
              onPaint={applyCells}
              onRect={applyRect}
              onFill={applyFill}
              onCellClick={knitCellClick}
              onEdges={applyEdges}
              onSelect={setSelection}
              onMoveSelection={moveSelection}
              activeTemplate={mode === 'template' ? activeTemplate : null}
              onSelectTemplate={(t) => setTplCell(t ? t.key : null)}
              onAddNote={addNoteAt}
              activeLayer={active}
              layerLocked={mode === 'pattern' && layerHidden}
              onShiftLayer={applyShiftLayer}
              symbol={symbol}
              onSymbols={applySymbols}
              display={display}
              />
              {mode === 'pattern' && image && (
                <ImageOverlay image={image} hexes={imagePreview} cellSize={cellSize} onChange={changeImage} />
              )}
              <NotesLayer
                notes={shownNotes}
                cellSize={cellSize}
                editable={mode === 'template'}
                draftId={draftNote?.id}
                focus={noteFocus}
                onUpdate={changeNote}
                onRemove={deleteNote}
                onNavigate={goToNoteCell}
                colorAt={noteColor}
              />
              {mode === 'template' && activeTemplate && (
                <div
                  className="tpl-tools"
                  style={{ left: 28 + (activeTemplate.c1 + 1) * cellSize + 6, top: 28 + activeTemplate.r0 * cellSize - 3 }}
                >
                  <button
                    onClick={() => duplicateTemplate(activeTemplate)}
                    title="Dupliker skabelon"
                    aria-label={`Dupliker ${activeTemplate.name}`}
                  >
                    <Copy width={14} height={14} />
                  </button>
                  <button
                    className="tpl-remove"
                    onClick={() => removeTemplate(activeTemplate)}
                    title="Slet skabelon (Delete)"
                    aria-label={`Slet ${activeTemplate.name}`}
                  >
                    ×
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>

          <div className="zoombar">
            <button className="icon-btn" onClick={() => zoom(-2)} title="Zoom ud">
              <Minus />
            </button>
            <span>{Math.round((cellSize / 18) * 100)}%</span>
            <button className="icon-btn" onClick={() => zoom(2)} title="Zoom ind">
              <Plus />
            </button>
          </div>

          {mode === 'knit' && knit.total > 0 && (
            <div className="knit-lockbar">
              <button
                className="icon-btn"
                onClick={() => gotoKnitRow(knit.rowIdx - 1)}
                disabled={knit.rowIdx === 0}
                title="Forrige række"
                aria-label="Forrige række"
              >
                <ChevronDown />
              </button>
              <button
                className="icon-btn"
                onClick={() => gotoKnitRow(knit.rowIdx + 1)}
                disabled={knit.rowIdx >= knit.total - 1}
                title="Næste række"
                aria-label="Næste række"
              >
                <ChevronUp />
              </button>
              <button
                className={'icon-btn lock' + (rowLocked ? ' on' : '')}
                onClick={() => setRowLocked((v) => !v)}
                title={rowLocked ? 'Lås rækken op' : 'Lås rækken'}
                aria-label={rowLocked ? 'Lås rækken op' : 'Lås rækken'}
                aria-pressed={rowLocked}
              >
                {rowLocked ? <Lock /> : <Unlock />}
              </button>
            </div>
          )}

          {colorDock === 'bottom' && colorBar}
          {mode === 'pattern' && tool === 'symbol' && <SymbolBar value={symbol} onSelect={setSymbol} />}
        </main>

        {/* Højre panel */}
        <aside
          className={'sidepanel' + (panelOpen[mode] ? '' : ' collapsed') + (panelMinimized ? ' minimized' : '')}
        >
          {/* kun synlig på desktop: minimér panelet til en smal kant */}
          <button
            className="panel-minimize"
            onClick={toggleMinimized}
            title={panelMinimized ? 'Vis panelet' : 'Minimér panelet'}
            aria-label={panelMinimized ? 'Vis panelet' : 'Minimér panelet'}
            aria-expanded={!panelMinimized}
          >
            {panelMinimized ? <ChevronLeft width={16} height={16} /> : <ChevronRight width={16} height={16} />}
          </button>
          {/* kun synlig på mobil: klap panelet sammen så lærredet fylder skærmen */}
          <button className="panel-toggle" onClick={togglePanel} aria-expanded={panelOpen[mode]}>
            {panelOpen[mode] ? 'Skjul info ▼' : 'Vis info ▲'}
          </button>
          <div className="sidepanel-body">
          {mode === 'pattern' && image && (
            <ImagePanel
              image={image}
              hasTemplate={templateInfo.closed}
              layerName={`"${layers[active].name}"`}
              onChange={changeImage}
              onApply={applyImage}
              onCancel={cancelImage}
            />
          )}
          {counted && (
            <div className="panel count-panel">
              <h3>Optælling</h3>
              {counted.areas > 1 && (
                <p className="muted">
                  {counted.areas} områder · {counted.cells} felter i alt
                </p>
              )}
              <div className="count-big">
                <div>
                  <b>{counted.stitches}</b> masker
                </div>
                <div>
                  <b>{counted.rows}</b> rækker
                </div>
              </div>
              {counted.inside > 0 && counted.inside < counted.cells && (
                <p className="muted">
                  Indenfor skabelonen: {counted.stitchesInside} masker × {counted.rowsInside} rækker ({counted.inside}{' '}
                  felter)
                </p>
              )}
              {mode === 'pattern' && counted.inside > 0 && (
                <ul className="count-colors">
                  {counted.colors.map((x) => (
                    <li key={x.hex || 'none'}>
                      <span className="inline-dot" style={{ background: x.hex || '#ffffff' }} />
                      {colorName(project, x.hex)}
                      <b>{x.count}</b>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn ghost small" onClick={() => setMeasure(null)}>
                Ryd optælling
              </button>
            </div>
          )}
          {mode === 'template' && (
            <div className="panel">
              <h3>Skabelon</h3>
              <TemplatesPanel
                templates={realTemplates}
                active={activeTemplate}
                onSelect={pickTemplate}
                onDuplicate={duplicateTemplate}
                onRemove={removeTemplate}
              />
              <p className="muted">
                Tegn en sort kant rundt om de felter du vil lave mønster på – ligesom cellekanter i Excel. Klik eller
                træk langs stregerne mellem felterne. Klik på en sort kant for at fjerne den igen (eller træk med højre
                museknap).
              </p>
              <p className="muted">
                Med <b>Rektangel</b> (R) trækker du en firkantet kant rundt om felterne på én gang. Efter en kant kan
                du fortsætte med piletasterne fra det lilla hjørne – <b>Shift</b>+pil flytter hjørnet uden at tegne, og{' '}
                <b>Alt</b>+pil fjerner kanten.
              </p>
              <div className="canvas-size">
                <span>
                  Lærred: <b>{project.cols}</b> masker × <b>{project.rows}</b> rækker
                </span>
                <button className="btn ghost small" onClick={() => setSizeOpen(true)}>
                  Ændr størrelse
                </button>
              </div>
              {templateInfo.closed ? (
                <div className="stat ok">
                  <Grid width={16} height={16} />{' '}
                  {templates.list.length > 1 ? `${templates.list.length} skabeloner · ` : ''}
                  {templateInfo.count} masker indenfor kanten
                </div>
              ) : (
                <div className="stat warn">
                  <Border width={16} height={16} /> Kanten er ikke lukket endnu – luk den hele vejen rundt. Indtil da
                  bruges hele gridet.
                </div>
              )}
              <div className="btn-col">
                <button className="btn ghost small" onClick={frameEdges}>
                  Kant rundt om hele gridet
                </button>
                <button className="btn ghost small" onClick={clearEdges}>
                  <Trash width={16} height={16} /> Fjern alle kanter
                </button>
              </div>
              <div className="btn-row">
                <button className="btn ghost small" onClick={copyButton} disabled={!activeTemplate && !selection}>
                  {selection ? 'Kopiér markering' : 'Kopiér skabelon'}
                </button>
                <button
                  className="btn ghost small"
                  onClick={paste}
                  disabled={clip?.kind !== 'template' && clip?.kind !== 'area'}
                >
                  Indsæt
                </button>
              </div>
              <MirrorPanel target={mirrorTarget?.label} onFlip={applyFlip} onRotate={applyRotate} onCopy={applyMirrorCopy} />
              <p className="hint">
                Tegn flere lukkede kanter for at lave flere skabeloner – fx for- og bagside. Med <b>Flyt rundt</b> (H)
                trækker du en færdig skabelon til et nyt sted; træk i et tomt område for at flytte lærredet. Klik på
                en skabelon for at vælge den – Ctrl+C kopierer den og Ctrl+V sætter en kopi ind ved siden af. Knapperne
                ved den valgte skabelon duplikerer eller sletter den (Delete sletter også).
              </p>
              <p className="hint">
                Med <b>Markér</b> (M) trækker du en ramme om et område og flytter det – kanter, farver og noter – ved at
                trække i det eller med piletasterne. Klipper du en færdig skabelon over, opløses den, indtil du samler
                den igen. Hold <b>Shift</b> nede for at markere flere områder på én gang. Ctrl+C kopierer markeringen,
                og Ctrl+V sætter kopien ind ved markeringen – klik på et felt med Markér for at vælge hvor.
              </p>
              <p className="hint">
                <b>Spejlvend</b> vender markeringen – eller den valgte skabelon – vandret eller lodret. Pilene lægger en
                spejlvendt kopi lige ved siden af; tegn halvdelen af en skabelon, og spejl den til højre for at få det
                hele. Kopien bliver markeret sammen med originalen, så du kan spejle videre nedad.
              </p>
              <p className="hint">
                Med <b>Tæl</b> (T) trækker du en ramme om et område og får antal masker og rækker. Hold <b>Shift</b>{' '}
                nede for at tælle flere områder på én gang. Esc rydder den.
              </p>
              <p className="hint">
                <b>Fra Google Sheets</b>: kopiér cellerne i regnearket og tryk Ctrl+V her. Hver celle bliver ét felt –
                farverne kommer på det aktive lag og oprettes i paletten, og tekst i en celle bliver en note i feltet.
                Mønsteret sættes ind ved markeringen (ellers øverst til venstre), og lærredet gøres større hvis det
                er nødvendigt.
              </p>
              <p className="hint">
                Med <b>Note</b> (N) klikker du på lærredet for at sætte en note, fx "Forstykke" eller "Start her". Noten
                gemmes, så snart du skriver. Som i Excel går Enter til feltet under og Tab til feltet til højre
                (Shift+Tab til venstre); Shift+Enter giver en ny linje i noten. Hold musen over noten og træk i håndtaget ⠿ for at flytte den. Noterne ses også i de andre tilstande, men kan kun rettes her.
              </p>
              <p className="hint">Hold Ctrl og scroll for at zoome.</p>
            </div>
          )}

          {mode === 'pattern' && (
            <div className="panel">
              <h3>Mønster</h3>
              <LayersPanel layers={layers} active={active} {...layerActions} />
              {layerHidden && <div className="stat warn">Laget er skjult – slå det til for at tegne.</div>}
              <p className="muted">
                Vælg en farve i bjælken nederst og klik eller træk hen over felterne. Tryk <b>+</b> for flere farver og
                for at give garnet navne.
              </p>
              <div className="stat">
                {project.currentColor ? (
                  <>
                    Aktiv farve:{' '}
                    <span className="inline-dot" style={{ background: project.currentColor }} />
                    {colorName(project, project.currentColor)}
                  </>
                ) : (
                  'Ingen farve valgt – tryk + i farvebjælken for at tilføje en.'
                )}
              </div>
              <div className="btn-col">
                <button
                  className="btn ghost small"
                  onClick={() =>
                    confirm(`Fjern alle farver fra "${layers[active].name}"?`) && commit(clearLayer(cur(), active))
                  }
                >
                  <Trash width={16} height={16} /> Ryd lag
                </button>
                {templateInfo.closed && (
                  <button
                    className="btn ghost small"
                    disabled={!hasOutside}
                    title="Slet alt mønster udenfor skabelonen"
                    onClick={() => commit(cropToTemplate(cur()))}
                  >
                    <Border width={16} height={16} /> Beskær til skabelonen
                  </button>
                )}
              </div>
              <div className="btn-row">
                <button className="btn ghost small" onClick={copyButton} disabled={!selection}>
                  Kopiér
                </button>
                <button className="btn ghost small" onClick={paste} disabled={clip?.kind !== 'pattern'}>
                  Indsæt
                </button>
              </div>
              <MirrorPanel target={mirrorTarget?.label} onFlip={applyFlip} onRotate={applyRotate} onCopy={applyMirrorCopy} />
              {poolArea && (
                <PoolingPanel
                  project={view}
                  settings={pooling}
                  onChange={(next) => onChange({ ...project, pooling: next })}
                  area={poolArea.label}
                  widest={widestRow(project, poolArea.mask)}
                  updating={poolingUpdates}
                  onApply={applyPlannedPooling}
                />
              )}
              <div className="btn-col image-insert">
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    startImage(e.target.files[0])
                    e.target.value = ''
                  }}
                />
                <button className="btn ghost small" onClick={() => imageFileRef.current.click()}>
                  <Image width={16} height={16} /> Indsæt billede
                </button>
              </div>
              <ReplaceColorPanel
                project={view}
                active={active}
                hasSelection={!!selection}
                onReplace={applyReplaceColor}
              />
              <p className="hint">
                Når du har udfyldt et felt, kan du bruge <b>piletasterne</b> til at udfylde nabofelterne med den valgte
                farve – ét felt pr. tryk ud fra det sidst udfyldte felt. Hold <b>Shift</b> nede for at springe et felt
                over uden at farve det. Delete rydder feltet, Esc slipper det.
              </p>
              <p className="hint">
                Med <b>Markér</b> trækker du en ramme om et område og flytter det ved at trække i det – eller med
                piletasterne. Hold <b>Shift</b> nede for at markere flere områder på én gang. Tomme felter i markeringen
                er gennemsigtige, så de ikke dækker det de flyttes hen over. Delete rydder markeringen, Esc slipper
                den. Ctrl+C kopierer markeringen, og Ctrl+V sætter kopien ind ved markeringen eller det sidst udfyldte
                felt.
              </p>
              <p className="hint">
                <b>Lag</b>: du tegner altid på det fremhævede lag. Med <b>Flyt rundt</b> (H) trækker du hele laget, når du
                starter på noget der er tegnet på det – eller flytter det med piletasterne. <b>Flet ned</b> lægger det
                aktive lag sammen med laget under. Skjulte lag strikkes ikke.
              </p>
              <p className="hint">
                Du kan også tegne <b>udenfor skabelonen</b> som en kladde – den vises lidt svagere og strikkes ikke.
                Markér den bagefter og træk den ind på skabelonen, hvor du vil have den. <b>Beskær til skabelonen</b>
                sletter det der er tilbage udenfor.
              </p>
              <p className="hint">
                Med <b>Tæl</b> (T) trækker du en ramme om et område og får antal masker, rækker og farver – hold{' '}
                <b>Shift</b> nede for at tælle flere områder.
              </p>
              <p className="hint">
                <b>Spejlvend</b> vender markeringen (eller alt på det aktive lag) vandret eller lodret. Pilene lægger
                en spejlvendt kopi lige ved siden af – kopien markeres sammen med originalen, så du fx kan spejle til
                højre og derefter nedad og få et mønster der er ens til alle sider.
              </p>
              <p className="hint">
                <b>Indsæt billede</b> (eller Ctrl+V med et billede) lægger et billede oven på lærredet – ved
                markeringen, hvis der er en. Træk det på plads, giv det det antal masker og rækker du vil have, og tryk{' '}
                <b>Pixelér</b>: hvert felt får billedets farve, og farverne kommer i paletten.
              </p>
              <p className="hint">
                <b>Erstat farve</b> skifter en farve ud med en anden overalt – eller kun på det aktive lag eller i
                markeringen. Under <b>+</b> i farvebjælken kan du også hente farverne fra et billede.
              </p>
              <p className="hint">
                <b>Fra Google Sheets</b>: kopiér cellerne og tryk Ctrl+V. Farverne kommer på det aktive lag og
                oprettes i paletten, og tekst i cellerne bliver noter.
              </p>
              <p className="hint">
                Med <b>Symbol</b> (S) sætter du strikkesymboler på felterne – vrang, omslag, indtagninger m.m. Vælg
                symbolet i bjælken nederst og klik eller træk. Klik igen eller brug højre museknap for at fjerne det.
                Symbolerne følger felterne, når du flytter, kopierer og spejler, og læses op i <b>Strik</b>.
              </p>
              <p className="hint">
                <b>Planned pooling</b> lægger et garn med et fast farveforløb ud maske for maske i markeringen (eller
                skabelonen), som garnet ville strikke det – frem og tilbage eller rundt. Ret forløbet og tryk{' '}
                <b>Opdater laget</b>, indtil mønsteret sidder.
              </p>
              <p className="hint">
                Genveje: B pensel · E viskelæder · R udfyld · G spand · M markér · H flyt rundt · S symbol · T tæl ·
                Ctrl+Z fortryd
              </p>
            </div>
          )}

          {mode === 'knit' && <KnitPanel project={project} templates={templates} knit={knit} onKnit={onKnit} />}
          </div>
        </aside>
      </div>
      {displayOpen && <DisplayDialog display={display} onChange={setDisplay} onClose={() => setDisplayOpen(false)} />}
      {sizeOpen && <CanvasSizeDialog project={view} onApply={applyResize} onClose={() => setSizeOpen(false)} />}
    </div>
  )
}
