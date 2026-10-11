import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridCanvas from './GridCanvas'
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
  findTemplates,
  moveTemplate,
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
} from './Icons'

const MODES = [
  { id: 'template', n: 1, label: 'Skabelon' },
  { id: 'pattern', n: 2, label: 'Mønster' },
  { id: 'knit', n: 3, label: 'Strik' },
]

export default function Editor({ project, onChange, onBack }) {
  const [mode, setMode] = useState('template')
  const [tool, setTool] = useState('pen')
  const [cellSize, setCellSize] = useState(18)
  const [history, setHistory] = useState({ past: [], future: [] })
  const [cursor, setCursor] = useState(null) // sidst udfyldte felt [r,c] i mønster-tilstand
  const [selection, setSelection] = useState(null) // markering {r0,c0,r1,c1} i mønster-tilstand
  const scrollRef = useRef(null)
  // de enkelte lukkede skabeloner på lærredet (fx for- og bagside)
  const templates = useMemo(
    () => findTemplates(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.cols, project.rows, project.shape, project.hEdges, project.vEdges],
  )
  const knit = useKnitState(project, templates)

  // skift standardværktøj når tilstand skifter
  useEffect(() => {
    setTool(mode === 'template' ? 'edge' : 'pen')
    setCursor(null)
    setSelection(null)
  }, [mode])

  // markeringen hører kun til markeringsværktøjet
  useEffect(() => {
    if (tool !== 'select') setSelection(null)
  }, [tool])

  // ---- historik ------------------------------------------------------
  const snap = (p) => ({ shape: p.shape, colors: p.colors, hEdges: p.hEdges, vEdges: p.vEdges })
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

  // ---- tegning ---------------------------------------------------------
  // GridCanvas tegner strøget lokalt og kalder først her når man slipper – så ét commit pr. strøg
  const applyCells = useCallback(
    (cells) => {
      const p = projectRef.current
      if (!cells.length) return
      setCursor(cells[cells.length - 1])
      const colors = p.colors.slice()
      const v = tool === 'eraser' ? null : p.currentColor
      // også udenfor skabelonen – der kan man tegne et mønster og trække det ind bagefter
      for (const [r, c] of cells) colors[r * p.cols + c] = v
      commit({ ...p, colors })
    },
    [tool, commit],
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
  const hasOutside = useMemo(
    () => project.colors.some((col, i) => col && !project.shape[i]),
    [project.colors, project.shape],
  )

  // flyt rundt: træk en hel skabelon til et nyt sted på lærredet
  const applyMoveTemplate = useCallback(
    (t, dr, dc) => {
      const p = projectRef.current
      const next = moveTemplate(p, templates, t, dr, dc)
      // skabelonens nøgle er dens første felt, som flytter med
      const focus = (p.knit.focus || []).map((k) => (k === t.key ? k + dr * p.cols + dc : k))
      commit({ ...next, knit: { ...p.knit, focus } })
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
      setCursor([r, c])
      commit(floodFill(project, r, c, project.currentColor))
    },
    [project, commit],
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

  // markering: flyt indholdet dr/dc felter (holdes indenfor gridet)
  const moveSelection = useCallback(
    (dr, dc) => {
      if (!selection) return
      const p = projectRef.current
      dr = Math.max(-selection.r0, Math.min(p.rows - 1 - selection.r1, dr))
      dc = Math.max(-selection.c0, Math.min(p.cols - 1 - selection.c1, dc))
      if (!dr && !dc) return
      commit({ ...p, colors: moveCells(p, selection, dr, dc) })
      setSelection({ r0: selection.r0 + dr, r1: selection.r1 + dr, c0: selection.c0 + dc, c1: selection.c1 + dc })
    },
    [selection, commit],
  )
  const clearSelection = useCallback(() => {
    if (!selection) return
    const p = projectRef.current
    const colors = p.colors.slice()
    for (let r = selection.r0; r <= selection.r1; r++)
      for (let c = selection.c0; c <= selection.c1; c++) colors[r * p.cols + c] = null
    commit({ ...p, colors })
  }, [selection, commit])

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
    const canvas = scrollRef.current?.querySelector('.grid-canvas')
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
      if (k === '1') setMode('template')
      if (k === '2') setMode('pattern')
      if (k === '3') setMode('knit')
      if (mode === 'knit') return
      if (mode === 'template') {
        if (k === 'h') setTool('hand')
        if (k === 'b' || k === 'p' || k === 'k') setTool('edge')
        return
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
  }, [mode, undo, redo, paintWithArrow, selection, moveSelection, clearSelection])

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
          { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
        ]
      : mode === 'pattern'
        ? [
            { id: 'pen', icon: <Pen />, label: 'Pensel (B)' },
            { id: 'eraser', icon: <Eraser />, label: 'Viskelæder (E)' },
            { id: 'rect', icon: <Rect />, label: 'Udfyld (R)' },
            { id: 'fill', icon: <Bucket />, label: 'Spand (G)' },
            { id: 'select', icon: <Select />, label: 'Markér (M)' },
            { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
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
              <GridCanvas
              project={project}
              mode={mode}
              tool={tool}
              cellSize={cellSize}
              highlight={highlight}
              cursorCell={mode === 'pattern' ? cursor : null}
              selection={mode === 'pattern' ? selection : null}
              templates={templates}
              onMoveTemplate={applyMoveTemplate}
              onPaint={applyCells}
              onRect={applyRect}
              onFill={applyFill}
              onCellClick={knitCellClick}
              onEdges={applyEdges}
              onSelect={setSelection}
              onMoveSelection={moveSelection}
              />
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
                if (tool === 'eraser' || tool === 'select' || tool === 'hand') setTool('pen')
              }}
              onUpdatePalette={(palette) => onChange({ ...project, palette })}
            />
          )}
        </main>

        {/* Højre panel */}
        <aside className="sidepanel">
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
                    onChange={(e) => commit(resizeProject(project, Number(e.target.value), project.rows))}
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
                    onChange={(e) => commit(resizeProject(project, project.cols, Number(e.target.value)))}
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
              <p className="hint">
                Tegn flere lukkede kanter for at lave flere skabeloner – fx for- og bagside. Med <b>Flyt rundt</b> (H)
                trækker du en færdig skabelon til et nyt sted; træk i et tomt område for at flytte lærredet.
              </p>
              <p className="hint">Hold Ctrl og scroll for at zoome.</p>
            </div>
          )}

          {mode === 'pattern' && (
            <div className="panel">
              <h3>Mønster</h3>
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
                  onClick={() => confirm('Fjern alle farver fra mønsteret?') && commit({ ...project, colors: project.colors.map(() => null) })}
                >
                  <Trash width={16} height={16} /> Ryd mønster
                </button>
                {templateInfo.closed && (
                  <button
                    className="btn ghost small"
                    disabled={!hasOutside}
                    title="Slet alt mønster udenfor skabelonen"
                    onClick={() => commit(cropToTemplate(project))}
                  >
                    <Border width={16} height={16} /> Beskær til skabelonen
                  </button>
                )}
              </div>
              <p className="hint">
                Når du har udfyldt et felt, kan du bruge <b>piletasterne</b> til at udfylde nabofelterne med den valgte
                farve – ét felt pr. tryk ud fra det sidst udfyldte felt. Esc slipper feltet.
              </p>
              <p className="hint">
                Med <b>Markér</b> trækker du en ramme om et område og flytter det ved at trække i det – eller med
                piletasterne. Delete rydder markeringen, Esc slipper den.
              </p>
              <p className="hint">
                Du kan også tegne <b>udenfor skabelonen</b> som en kladde – den vises lidt svagere og strikkes ikke.
                Markér den bagefter og træk den ind på skabelonen, hvor du vil have den. <b>Beskær til skabelonen</b>
                sletter det der er tilbage udenfor.
              </p>
              <p className="hint">
                Genveje: B pensel · E viskelæder · R udfyld · G spand · M markér · H flyt rundt · Ctrl+Z fortryd
              </p>
            </div>
          )}

          {mode === 'knit' && <KnitPanel project={project} templates={templates} knit={knit} onKnit={onKnit} />}
        </aside>
      </div>
    </div>
  )
}
