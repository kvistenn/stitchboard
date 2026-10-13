import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridCanvas from './GridCanvas'
import NotesLayer from './NotesLayer'
import LayersPanel from './LayersPanel'
import ColorBar from './ColorBar'
import KnitPanel, { useKnitState } from './KnitPanel'
import {
  floodFill,
  cropToTemplate,
  pushRecent,
  resizeProject,
  shapeFromEdges,
  emptyEdges,
  moveCells,
  moveRegion,
  copyArea,
  pasteArea,
  countRegion,
  colorName,
  findTemplates,
  moveTemplate,
  copyRegion,
  pasteRegion,
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
  hasDraftOutside,
  hIdx,
  vIdx,
  MAX_SIZE,
} from '../state'
import { downloadJSON } from '../storage'
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
} from './Icons'

const MODES = [
  { id: 'template', n: 1, label: 'Skabelon' },
  { id: 'pattern', n: 2, label: 'Mønster' },
  { id: 'knit', n: 3, label: 'Strik' },
]

// Udklipsholder på modulniveau, så en kopi kan sættes ind i et andet projekt i samme session
let clipboard = null

// Sammenklappet infopanel på mobil, husket pr. tilstand (Strik starter foldet ud)
const PANEL_KEY = 'stitchboard.panel'
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
  const [selection, setSelection] = useState(null) // markering {r0,c0,r1,c1} (Markér-værktøjet)
  const [measure, setMeasure] = useState(null) // område der tælles {r0,c0,r1,c1} (Tæl-værktøjet)
  const [tplCell, setTplCell] = useState(null) // et felt i den valgte skabelon (skabelon-tilstand)
  const [clip, setClipState] = useState(() => clipboard)
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  // en ny note ligger her indtil den får tekst – så en tom note aldrig ender i projektet eller historikken
  const [draftNote, setDraftNote] = useState(null)
  const [noteFocus, setNoteFocus] = useState(null) // {id, n}: noten der skal have fokus (n giver fokus igen)
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
    setSelection(null)
    setMeasure(null)
    setTplCell(null)
    setDraftNote(null)
  }, [mode])

  // markeringen hører kun til markeringsværktøjet
  useEffect(() => {
    if (tool !== 'select') setSelection(null)
    if (tool !== 'count') setMeasure(null)
    if (tool !== 'hand') setTplCell(null)
  }, [tool])

  // ---- historik ------------------------------------------------------
  const snap = (p) => ({
    shape: p.shape,
    colors: p.colors,
    layers: p.layers,
    hEdges: p.hEdges,
    vEdges: p.vEdges,
    notes: p.notes || [],
  })
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
    onChange({ ...project, ...prev })
  }, [history, project, onChange])
  const redo = useCallback(() => {
    if (!history.future.length) return
    const nxt = history.future[0]
    setHistory({
      past: [...history.past, snap(project)],
      future: history.future.slice(1),
    })
    onChange({ ...project, ...nxt })
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
      // også udenfor skabelonen – der kan man tegne et mønster og trække det ind bagefter
      commit(paintCells(p, active, cells, v))
    },
    [tool, commit, active, layerHidden],
  )

  // kant-pennen (skabelon-tilstand)
  const applyEdges = useCallback(
    (edges, value) => {
      const p = projectRef.current
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
      setCursor([r, c])
      commit(floodFill(p, r, c, p.currentColor, active))
    },
    [commit, active, layerHidden],
  )

  // piletaster: udfyld nabofeltet ud fra det sidst udfyldte felt
  const paintWithArrow = useCallback(
    (key) => {
      if (!cursor) return false
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[key]
      if (!d) return false
      const p = projectRef.current
      const r = cursor[0] + d[0]
      const c = cursor[1] + d[1]
      if (r < 0 || c < 0 || r >= p.rows || c >= p.cols) return true
      applyCells([[r, c]])
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
      setSelection({ r0: selection.r0 + dr, r1: selection.r1 + dr, c0: selection.c0 + dc, c1: selection.c1 + dc })
    },
    [selection, commit, active, layerHidden, mode, templates],
  )
  const counted = useMemo(() => (measure ? countRegion(project, measure) : null), [measure, project])
  const clearSelection = useCallback(() => {
    if (!selection || layerHidden) return
    const cells = []
    for (let r = selection.r0; r <= selection.r1; r++) for (let c = selection.c0; c <= selection.c1; c++) cells.push([r, c])
    commit(paintCells(cur(), active, cells, null))
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

  // ---- kopiér / indsæt ---------------------------------------------------
  const setClip = (c) => {
    clipboard = c
    setClipState(c)
  }
  const copy = useCallback(() => {
    const p = cur()
    if (mode === 'pattern' && selection) setClip(copyRegion(p, selection, active))
    // skabelon-tilstand: markeringen hvis der er en, ellers den valgte skabelon
    if (mode === 'template' && selection) setClip(copyArea(p, selection))
    else if (mode === 'template' && activeTemplate) setClip(copyTemplate(p, activeTemplate))
  }, [mode, selection, activeTemplate, active])
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

  const selectColor = (hex) => {
    onChange({ ...project, currentColor: hex, recent: pushRecent(project.recent, hex) })
  }

  // ---- strik -------------------------------------------------------------
  const onKnit = (k) => onChange({ ...project, knit: k })
  const knitCellClick = (r, c) => {
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
      if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'v') && mode !== 'knit') {
        e.preventDefault()
        k === 'c' ? copy() : paste()
        return
      }
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
        if (k === 'n') setTool('note')
        if (k === 'm') setTool('select')
        if (e.key === 'Escape') {
          setTplCell(null)
          setSelection(null)
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
      } else if (e.key.startsWith('Arrow') && paintWithArrow(e.key)) {
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
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [
    mode,
    tool,
    undo,
    redo,
    paintWithArrow,
    selection,
    moveSelection,
    clearSelection,
    cursor,
    commit,
    copy,
    paste,
    applyShiftLayer,
    active,
    layerHidden,
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
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
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
              />
              <NotesLayer
                notes={shownNotes}
                cellSize={cellSize}
                editable={mode === 'template'}
                draftId={draftNote?.id}
                focus={noteFocus}
                onUpdate={changeNote}
                onRemove={deleteNote}
                onNavigate={goToNoteCell}
              />
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

          {mode === 'pattern' && (
            <ColorBar
              project={project}
              onSelect={(hex) => {
                selectColor(hex)
                if (['eraser', 'select', 'hand', 'count'].includes(tool)) setTool('pen')
              }}
              onUpdatePalette={(palette) => onChange({ ...project, palette })}
            />
          )}
        </main>

        {/* Højre panel */}
        <aside className={'sidepanel' + (panelOpen[mode] ? '' : ' collapsed')}>
          {/* kun synlig på mobil: klap panelet sammen så lærredet fylder skærmen */}
          <button className="panel-toggle" onClick={togglePanel} aria-expanded={panelOpen[mode]}>
            {panelOpen[mode] ? 'Skjul info ▼' : 'Vis info ▲'}
          </button>
          <div className="sidepanel-body">
          {counted && (
            <div className="panel count-panel">
              <h3>Optælling</h3>
              <div className="count-big">
                <div>
                  <b>{counted.stitches}</b> masker
                </div>
                <div>
                  <b>{counted.rows}</b> rækker
                </div>
              </div>
              {counted.inside > 0 && counted.inside < counted.rows * counted.stitches && (
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
              <p className="muted">
                Tegn en sort kant rundt om de felter du vil lave mønster på – ligesom cellekanter i Excel. Klik eller
                træk langs stregerne mellem felterne. Klik på en sort kant for at fjerne den igen (eller træk med højre
                museknap).
              </p>
              <div className="field-row">
                <label className="field col">
                  <span>Masker (bredde)</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max={MAX_SIZE}
                    value={project.cols}
                    onChange={(e) => commit(resizeProject(cur(), Number(e.target.value), project.rows))}
                  />
                </label>
                <label className="field col">
                  <span>Rækker (højde)</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max={MAX_SIZE}
                    value={project.rows}
                    onChange={(e) => commit(resizeProject(cur(), project.cols, Number(e.target.value)))}
                  />
                </label>
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
                <button className="btn ghost small" onClick={copy} disabled={!activeTemplate && !selection}>
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
              <p className="hint">
                Tegn flere lukkede kanter for at lave flere skabeloner – fx for- og bagside. Med <b>Flyt rundt</b> (H)
                trækker du en færdig skabelon til et nyt sted; træk i et tomt område for at flytte lærredet. Klik på
                en skabelon for at vælge den – Ctrl+C kopierer den og Ctrl+V sætter en kopi ind ved siden af.
              </p>
              <p className="hint">
                Med <b>Markér</b> (M) trækker du en ramme om et område og flytter det – kanter, farver og noter – ved at
                trække i det eller med piletasterne. Klipper du en færdig skabelon over, opløses den, indtil du samler
                den igen. Ctrl+C kopierer markeringen, og Ctrl+V sætter kopien ind ved markeringen – klik på et felt
                med Markér for at vælge hvor.
              </p>
              <p className="hint">
                Med <b>Tæl</b> (T) trækker du en ramme om et område og får antal masker og rækker. Esc rydder den.
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
                Aktiv farve:{' '}
                <span className="inline-dot" style={{ background: project.currentColor }} />
                {project.palette.find((p) => p.hex === project.currentColor)?.name || project.currentColor}
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
                <button className="btn ghost small" onClick={copy} disabled={!selection}>
                  Kopiér
                </button>
                <button className="btn ghost small" onClick={paste} disabled={clip?.kind !== 'pattern'}>
                  Indsæt
                </button>
              </div>
              <p className="hint">
                Når du har udfyldt et felt, kan du bruge <b>piletasterne</b> til at udfylde nabofelterne med den valgte
                farve – ét felt pr. tryk ud fra det sidst udfyldte felt. Delete rydder feltet, Esc slipper det.
              </p>
              <p className="hint">
                Med <b>Markér</b> trækker du en ramme om et område og flytter det ved at trække i det – eller med
                piletasterne. Delete rydder markeringen, Esc slipper den. Ctrl+C kopierer markeringen, og Ctrl+V
                sætter kopien ind ved markeringen eller det sidst udfyldte felt.
              </p>
              <p className="hint">
                <b>Lag</b>: du tegner altid på det fremhævede lag. Med <b>Flyt rundt</b> (H) trækker du hele laget, når du
                starter på noget der er tegnet på det – eller flytter det med piletasterne. Skjulte lag strikkes ikke.
              </p>
              <p className="hint">
                Du kan også tegne <b>udenfor skabelonen</b> som en kladde – den vises lidt svagere og strikkes ikke.
                Markér den bagefter og træk den ind på skabelonen, hvor du vil have den. <b>Beskær til skabelonen</b>
                sletter det der er tilbage udenfor.
              </p>
              <p className="hint">
                Med <b>Tæl</b> (T) trækker du en ramme om et område og får antal masker, rækker og farver.
              </p>
              <p className="hint">
                Genveje: B pensel · E viskelæder · R udfyld · G spand · M markér · H flyt rundt · T tæl · Ctrl+Z fortryd
              </p>
            </div>
          )}

          {mode === 'knit' && <KnitPanel project={project} templates={templates} knit={knit} onKnit={onKnit} />}
          </div>
        </aside>
      </div>
    </div>
  )
}
