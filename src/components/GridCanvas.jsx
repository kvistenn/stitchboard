import { useEffect, useRef, useState, useCallback } from 'react'
import { cellsOnLine } from '../state'

const MARGIN = 28 // plads til række-/maskenumre

/**
 * Tegner gridet på et canvas og håndterer tegning med mus/finger.
 *
 * props:
 *  project, mode ('template'|'pattern'|'knit'), tool, cellSize
 *  highlight: { gridRow, cols:Set, segCols:Set } (strik-tilstand)
 *  onPaint(cells[[r,c]...], meta)  – pen/viskelæder (meta.start = første kald i et strøg)
 *  onRect(r0,c0,r1,c1)             – rektangel
 *  onFill(r,c)                     – spand
 *  onPick(r,c)                     – pipette
 *  onCellClick(r,c)                – klik i strik-tilstand
 */
export default function GridCanvas({
  project,
  mode,
  tool,
  cellSize,
  highlight,
  onPaint,
  onRect,
  onFill,
  onPick,
  onCellClick,
}) {
  const canvasRef = useRef(null)
  const [drag, setDrag] = useState(null) // { r0,c0,r1,c1 } for rektangel
  const strokeRef = useRef(null) // { last:[r,c], button }

  const { cols, rows } = project
  const width = cols * cellSize + MARGIN * 2
  const height = rows * cellSize + MARGIN * 2

  // ---- tegning -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const { shape, colors } = project
    const cs = cellSize
    const ox = MARGIN
    const oy = MARGIN

    // celler
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const x = ox + c * cs
        const y = oy + r * cs
        if (shape[i]) {
          ctx.fillStyle = colors[i] || '#ffffff'
          ctx.fillRect(x, y, cs, cs)
        } else {
          ctx.fillStyle = mode === 'template' ? '#eef0f4' : '#f6f7fa'
          ctx.fillRect(x, y, cs, cs)
        }
      }
    }

    // gitterlinjer
    ctx.lineWidth = 1
    for (let c = 0; c <= cols; c++) {
      const x = ox + c * cs + 0.5
      ctx.strokeStyle = c % 10 === 0 ? 'rgba(15,23,42,0.35)' : 'rgba(15,23,42,0.12)'
      ctx.beginPath()
      ctx.moveTo(x, oy)
      ctx.lineTo(x, oy + rows * cs)
      ctx.stroke()
    }
    for (let r = 0; r <= rows; r++) {
      const y = oy + r * cs + 0.5
      ctx.strokeStyle = r % 10 === 0 ? 'rgba(15,23,42,0.35)' : 'rgba(15,23,42,0.12)'
      ctx.beginPath()
      ctx.moveTo(ox, y)
      ctx.lineTo(ox + cols * cs, y)
      ctx.stroke()
    }

    // skabelonens kant (tyk linje hvor indenfor møder udenfor)
    ctx.strokeStyle = mode === 'template' ? '#7d2ae8' : '#0f172a'
    ctx.lineWidth = mode === 'template' ? 3 : 2.5
    ctx.lineCap = 'square'
    ctx.beginPath()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (!shape[i]) continue
        const x = ox + c * cs
        const y = oy + r * cs
        if (r === 0 || !shape[i - cols]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + cs, y)
        }
        if (r === rows - 1 || !shape[i + cols]) {
          ctx.moveTo(x, y + cs)
          ctx.lineTo(x + cs, y + cs)
        }
        if (c === 0 || !shape[i - 1]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + cs)
        }
        if (c === cols - 1 || !shape[i + 1]) {
          ctx.moveTo(x + cs, y)
          ctx.lineTo(x + cs, y + cs)
        }
      }
    }
    ctx.stroke()

    // strik-tilstand: dæmp alt undtagen aktuel række
    if (mode === 'knit' && highlight) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      for (let r = 0; r < rows; r++) {
        if (r === highlight.gridRow) continue
        ctx.fillRect(ox, oy + r * cs, cols * cs, cs)
      }
      // færdige rækker: lille flueben-overlay (lysgrøn tone)
      if (highlight.doneRows) {
        ctx.fillStyle = 'rgba(34,197,94,0.18)'
        for (const r of highlight.doneRows) ctx.fillRect(ox, oy + r * cs, cols * cs, cs)
      }
      const y = oy + highlight.gridRow * cs
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 3
      ctx.strokeRect(ox - 1.5, y - 1.5, cols * cs + 3, cs + 3)
      if (highlight.segCols && highlight.segCols.size) {
        const arr = [...highlight.segCols]
        const min = Math.min(...arr)
        const max = Math.max(...arr)
        ctx.strokeStyle = '#00c4cc'
        ctx.lineWidth = 4
        ctx.strokeRect(ox + min * cs + 2, y + 2, (max - min + 1) * cs - 4, cs - 4)
      }
    }

    // rektangel-forhåndsvisning
    if (drag) {
      const r0 = Math.min(drag.r0, drag.r1)
      const r1 = Math.max(drag.r0, drag.r1)
      const c0 = Math.min(drag.c0, drag.c1)
      const c1 = Math.max(drag.c0, drag.c1)
      ctx.fillStyle = 'rgba(125,42,232,0.25)'
      ctx.fillRect(ox + c0 * cs, oy + r0 * cs, (c1 - c0 + 1) * cs, (r1 - r0 + 1) * cs)
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 2
      ctx.strokeRect(ox + c0 * cs, oy + r0 * cs, (c1 - c0 + 1) * cs, (r1 - r0 + 1) * cs)
    }

    // numre i margen (hver 5./10. afhængigt af zoom)
    ctx.fillStyle = '#64748b'
    ctx.font = `${Math.max(9, Math.min(12, cs * 0.7))}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const step = cs >= 14 ? 5 : 10
    for (let c = 0; c < cols; c++) {
      const n = cols - c // masker tælles fra højre som i strikkediagrammer
      if (n % step === 0 || n === 1) {
        ctx.fillText(String(n), ox + c * cs + cs / 2, oy + rows * cs + MARGIN / 2)
      }
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r++) {
      const n = rows - r // rækker tælles nedefra
      if (n % step === 0 || n === 1) {
        ctx.fillText(String(n), ox - 6, oy + r * cs + cs / 2)
        ctx.textAlign = 'left'
        ctx.fillText(String(n), ox + cols * cs + 6, oy + r * cs + cs / 2)
        ctx.textAlign = 'right'
      }
    }
  }, [project, mode, cellSize, highlight, drag, width, height, cols, rows])

  // ---- input -----------------------------------------------------------
  const cellAt = useCallback(
    (e) => {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left - MARGIN
      const y = e.clientY - rect.top - MARGIN
      const c = Math.floor(x / cellSize)
      const r = Math.floor(y / cellSize)
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null
      return [r, c]
    },
    [cellSize, rows, cols],
  )

  const clamp = (r, c) => [Math.max(0, Math.min(rows - 1, r)), Math.max(0, Math.min(cols - 1, c))]

  const onPointerDown = (e) => {
    if (tool === 'hand') return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const cell = cellAt(e)
    if (!cell) return
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    const [r, c] = cell
    if (mode === 'knit') {
      onCellClick && onCellClick(r, c)
      return
    }
    if (tool === 'rect') {
      setDrag({ r0: r, c0: c, r1: r, c1: c })
      return
    }
    if (tool === 'fill') {
      onFill && onFill(r, c)
      return
    }
    if (tool === 'pick') {
      onPick && onPick(r, c)
      return
    }
    strokeRef.current = { last: [r, c] }
    onPaint && onPaint([[r, c]], { start: true })
  }

  const onPointerMove = (e) => {
    if (tool === 'hand' || mode === 'knit') return
    if (drag) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left - MARGIN
      const y = e.clientY - rect.top - MARGIN
      const [r, c] = clamp(Math.floor(y / cellSize), Math.floor(x / cellSize))
      if (r !== drag.r1 || c !== drag.c1) setDrag({ ...drag, r1: r, c1: c })
      return
    }
    const s = strokeRef.current
    if (!s) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - MARGIN
    const y = e.clientY - rect.top - MARGIN
    const [r, c] = clamp(Math.floor(y / cellSize), Math.floor(x / cellSize))
    if (r === s.last[0] && c === s.last[1]) return
    const line = cellsOnLine(s.last[0], s.last[1], r, c).slice(1)
    s.last = [r, c]
    onPaint && onPaint(line, { start: false })
  }

  const onPointerUp = () => {
    if (drag) {
      onRect && onRect(drag.r0, drag.c0, drag.r1, drag.c1)
      setDrag(null)
    }
    strokeRef.current = null
  }

  const cursor =
    tool === 'hand'
      ? 'grab'
      : mode === 'knit'
        ? 'pointer'
        : tool === 'pick'
          ? 'crosshair'
          : 'crosshair'

  return (
    <canvas
      ref={canvasRef}
      className="grid-canvas"
      style={{ cursor, touchAction: tool === 'hand' || mode === 'knit' ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
