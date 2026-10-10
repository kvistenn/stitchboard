import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridCanvas from './GridCanvas'
import ColorBar from './ColorBar'
import KnitPanel, { useKnitState } from './KnitPanel'
import { floodFill, pushRecent, resizeProject, MAX_SIZE } from '../state'
import { downloadJSON } from '../storage'
import {
  Pen,
  Eraser,
  Rect,
  Bucket,
  Picker,
  Hand,
  Undo,
  Redo,
  Mirror,
  Plus,
  Minus,
  Back,
  Download,
  Image,
  Grid,
  Trash,
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
  const [mirror, setMirror] = useState(false)
  const [history, setHistory] = useState({ past: [], future: [] })
  const scrollRef = useRef(null)
  const knit = useKnitState(project)

  // skift standardværktøj når tilstand skifter
  useEffect(() => {
    setTool('pen')
  }, [mode])

  // ---- historik ------------------------------------------------------
  const commit = useCallback(
    (next) => {
      setHistory((h) => ({
        past: [...h.past.slice(-49), { shape: project.shape, colors: project.colors }],
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
      future: [{ shape: project.shape, colors: project.colors }, ...history.future],
    })
    onChange({ ...project, ...prev })
  }, [history, project, onChange])
  const redo = useCallback(() => {
    if (!history.future.length) return
    const nxt = history.future[0]
    setHistory({
      past: [...history.past, { shape: project.shape, colors: project.colors }],
      future: history.future.slice(1),
    })
    onChange({ ...project, ...nxt })
  }, [history, project, onChange])

  // Seneste projekt i en ref, så hurtige pointer-events under et strøg bygger videre på hinanden
  const projectRef = useRef(project)
  projectRef.current = project

  // ---- tegning ---------------------------------------------------------
  const expandMirror = useCallback(
    (cells) => {
      if (!mirror) return cells
      const out = []
      for (const [r, c] of cells) {
        out.push([r, c])
        out.push([r, project.cols - 1 - c])
      }
      return out
    },
    [mirror, project.cols],
  )

  const applyCells = useCallback(
    (cells, { start }) => {
      const p = projectRef.current
      cells = expandMirror(cells)
      let next
      if (mode === 'template') {
        const shape = p.shape.slice()
        const v = tool === 'eraser' ? 0 : 1
        for (const [r, c] of cells) shape[r * p.cols + c] = v
        next = { ...p, shape }
      } else {
        const colors = p.colors.slice()
        const v = tool === 'eraser' ? null : p.currentColor
        for (const [r, c] of cells) {
          const i = r * p.cols + c
          if (p.shape[i]) colors[i] = v
        }
        next = { ...p, colors }
      }
      projectRef.current = next
      if (start) commit(next)
      else onChange(next)
    },
    [mode, tool, commit, onChange, expandMirror],
  )

  const applyRect = useCallback(
    (r0, c0, r1, c1) => {
      const cells = []
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
        for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) cells.push([r, c])
      applyCells(cells, { start: true })
    },
    [applyCells],
  )

  const applyFill = useCallback(
    (r, c) => {
      if (mode === 'template') {
        // fyld hele skabelonen / tøm hele skabelonen
        const v = project.shape[r * project.cols + c] ? 0 : 1
        commit({ ...project, shape: project.shape.map(() => v) })
      } else {
        commit(floodFill(project, r, c, project.currentColor))
      }
    },
    [mode, project, commit],
  )

  const pick = useCallback(
    (r, c) => {
      const hex = project.colors[r * project.cols + c]
      if (hex) selectColor(hex)
      setTool('pen')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project],
  )

  const selectColor = (hex) => {
    onChange({ ...project, currentColor: hex, recent: pushRecent(project.recent, hex) })
  }

  // ---- strik -------------------------------------------------------------
  const onKnit = (k) => onChange({ ...project, knit: k })
  const knitCellClick = (r) => {
    const i = knit.rowList.indexOf(r)
    if (i >= 0) onKnit({ ...project.knit, row: i, seg: 0 })
  }
  const highlight = useMemo(() => {
    if (mode !== 'knit' || knit.gridRow === undefined) return null
    const seg = knit.segs[knit.segIdx]
    const done = knit.rowList.slice(0, knit.rowIdx)
    return { gridRow: knit.gridRow, segCols: new Set(seg ? seg.cols : []), doneRows: done }
  }, [mode, knit])

  // rul den aktuelle række ind i midten af skærmen i strik-tilstand
  useEffect(() => {
    if (!highlight) return
    const outer = scrollRef.current?.querySelector('.canvas-scroll-outer')
    const canvas = scrollRef.current?.querySelector('.grid-canvas')
    if (!outer || !canvas) return
    const y = canvas.offsetTop + 28 + highlight.gridRow * cellSize + cellSize / 2
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
    const h = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoom(e.deltaY < 0 ? 2 : -2)
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
      if (mode === 'knit') return
      if (k === 'b' || k === 'p') setTool('pen')
      if (k === 'e') setTool('eraser')
      if (k === 'r') setTool('rect')
      if (k === 'g') setTool('fill')
      if (k === 'i' && mode === 'pattern') setTool('pick')
      if (k === 'h') setTool('hand')
      if (k === 'm') setMirror((m) => !m)
      if (k === '1') setMode('template')
      if (k === '2') setMode('pattern')
      if (k === '3') setMode('knit')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mode, undo, redo])

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
    ctx.lineWidth = 2
    for (let r = 0; r < project.rows; r++)
      for (let c = 0; c < project.cols; c++) {
        const i = r * project.cols + c
        if (!project.shape[i]) continue
        const x = 1 + c * cs
        const y = 1 + r * cs
        ctx.beginPath()
        if (r === 0 || !project.shape[i - project.cols]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + cs, y)
        }
        if (r === project.rows - 1 || !project.shape[i + project.cols]) {
          ctx.moveTo(x, y + cs)
          ctx.lineTo(x + cs, y + cs)
        }
        if (c === 0 || !project.shape[i - 1]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + cs)
        }
        if (c === project.cols - 1 || !project.shape[i + 1]) {
          ctx.moveTo(x + cs, y)
          ctx.lineTo(x + cs, y + cs)
        }
        ctx.stroke()
      }
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${project.name || 'skabelon'}.png`
    a.click()
  }

  const toolDefs =
    mode === 'template'
      ? [
          { id: 'pen', icon: <Pen />, label: 'Tilføj til skabelon (B)' },
          { id: 'eraser', icon: <Eraser />, label: 'Fjern fra skabelon (E)' },
          { id: 'rect', icon: <Rect />, label: 'Rektangel (R)' },
          { id: 'fill', icon: <Bucket />, label: 'Fyld / tøm alt (G)' },
          { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
        ]
      : mode === 'pattern'
        ? [
            { id: 'pen', icon: <Pen />, label: 'Pensel (B)' },
            { id: 'eraser', icon: <Eraser />, label: 'Viskelæder (E)' },
            { id: 'rect', icon: <Rect />, label: 'Rektangel (R)' },
            { id: 'fill', icon: <Bucket />, label: 'Spand (G)' },
            { id: 'pick', icon: <Picker />, label: 'Pipette (I)' },
            { id: 'hand', icon: <Hand />, label: 'Flyt rundt (H)' },
          ]
        : []

  const inside = project.shape.reduce((a, b) => a + b, 0)

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
            <div className="rail-sep" />
            <button
              className={'tool' + (mirror ? ' active' : '')}
              onClick={() => setMirror((m) => !m)}
              title="Spejl vandret (M)"
            >
              <Mirror />
              <span>Spejl</span>
            </button>
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
              onPaint={applyCells}
              onRect={applyRect}
              onFill={applyFill}
              onPick={pick}
              onCellClick={knitCellClick}
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
                if (tool === 'eraser' || tool === 'pick') setTool('pen')
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
                Tegn udsnittet af det du vil strikke. Den lilla kant viser skabelonen – kun felter indenfor kan få
                farve.
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
              <div className="stat">
                <Grid width={16} height={16} /> {inside} masker i skabelonen
              </div>
              <div className="btn-col">
                <button className="btn ghost small" onClick={() => commit({ ...project, shape: project.shape.map(() => 1) })}>
                  Fyld hele gridet
                </button>
                <button className="btn ghost small" onClick={() => commit({ ...project, shape: project.shape.map(() => 0) })}>
                  Tøm skabelonen
                </button>
              </div>
              <p className="hint">
                Tip: Slå <b>Spejl</b> til for symmetriske former som sokker og vanter. Hold Ctrl og scroll for at zoome.
              </p>
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
              </div>
              <p className="hint">
                Genveje: B pensel · E viskelæder · R rektangel · G spand · I pipette · M spejl · Ctrl+Z fortryd
              </p>
            </div>
          )}

          {mode === 'knit' && <KnitPanel project={project} onKnit={onKnit} />}
        </aside>
      </div>
    </div>
  )
}
