import { useEffect, useRef, useState, useCallback } from 'react'
import { cellsOnLine, hIdx, vIdx } from '../state'

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
 *  onEdges(edges[{type,r,c}], {start, value}) – kant-pennen i skabelon-tilstand
 */
export default function GridCanvas({
  project,
  mode,
  tool,
  cellSize,
  highlight,
  cursorCell,
  onPaint,
  onRect,
  onFill,
  onPick,
  onCellClick,
  onEdges,
}) {
  const canvasRef = useRef(null)
  const [drag, setDrag] = useState(null) // { r0,c0,r1,c1 } for rektangel
  const strokeRef = useRef(null) // { last:[r,c] } eller { lastPt:[x,y], value } for kanter
  const [hoverEdge, setHoverEdge] = useState(null) // { type:'h'|'v', r, c }

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
          ctx.fillStyle = '#e9ecf1'
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

    // skabelonens kant: de sorte streger brugeren har tegnet
    const { hEdges, vEdges } = project
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = Math.max(2.5, Math.min(4, cs * 0.18))
    ctx.lineCap = 'square'
    ctx.beginPath()
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!hEdges[hIdx(cols, r, c)]) continue
        const y = oy + r * cs
        ctx.moveTo(ox + c * cs, y)
        ctx.lineTo(ox + (c + 1) * cs, y)
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) {
        if (!vEdges[vIdx(cols, r, c)]) continue
        const x = ox + c * cs
        ctx.moveTo(x, oy + r * cs)
        ctx.lineTo(x, oy + (r + 1) * cs)
      }
    }
    ctx.stroke()

    // forhåndsvisning af kanten under musen
    if (mode === 'template' && hoverEdge && tool === 'edge') {
      ctx.strokeStyle = 'rgba(125,42,232,0.7)'
      ctx.lineWidth = Math.max(3, Math.min(5, cs * 0.22))
      ctx.beginPath()
      if (hoverEdge.type === 'h') {
        const y = oy + hoverEdge.r * cs
        ctx.moveTo(ox + hoverEdge.c * cs, y)
        ctx.lineTo(ox + (hoverEdge.c + 1) * cs, y)
      } else {
        const x = ox + hoverEdge.c * cs
        ctx.moveTo(x, oy + hoverEdge.r * cs)
        ctx.lineTo(x, oy + (hoverEdge.r + 1) * cs)
      }
      ctx.stroke()
    }

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

    // markør: sidst udfyldte felt (piletaster udfylder herfra)
    if (cursorCell) {
      const [cr, cc] = cursorCell
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 3
      ctx.strokeRect(ox + cc * cs + 1.5, oy + cr * cs + 1.5, cs - 3, cs - 3)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(ox + cc * cs + 3.5, oy + cr * cs + 3.5, cs - 7, cs - 7)
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
  }, [project, mode, tool, cellSize, highlight, cursorCell, drag, hoverEdge, width, height, cols, rows])

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

  /** Nærmeste kant til et punkt (px relativt til gridets øverste venstre hjørne) */
  const edgeAtPoint = useCallback(
    (x, y) => {
      const cs = cellSize
      // tillad lidt luft udenfor gridet
      if (x < -cs / 2 || y < -cs / 2 || x > cols * cs + cs / 2 || y > rows * cs + cs / 2) return null
      const c = Math.max(0, Math.min(cols - 1, Math.floor(x / cs)))
      const r = Math.max(0, Math.min(rows - 1, Math.floor(y / cs)))
      const lx = x - c * cs
      const ly = y - r * cs
      const d = [
        [ly, { type: 'h', r, c }],
        [cs - ly, { type: 'h', r: r + 1, c }],
        [lx, { type: 'v', r, c }],
        [cs - lx, { type: 'v', r, c: c + 1 }],
      ]
      d.sort((a, b) => a[0] - b[0])
      return d[0][1]
    },
    [cellSize, cols, rows],
  )
  const cornerAt = (x, y) => [
    Math.max(0, Math.min(rows, Math.round(y / cellSize))),
    Math.max(0, Math.min(cols, Math.round(x / cellSize))),
  ]
  const sameEdge = (a, b) => a && b && a.type === b.type && a.r === b.r && a.c === b.c
  const edgeValue = (e) =>
    e.type === 'h' ? project.hEdges[hIdx(cols, e.r, e.c)] : project.vEdges[vIdx(cols, e.r, e.c)]
  const localPt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [e.clientX - rect.left - MARGIN, e.clientY - rect.top - MARGIN]
  }

  const onPointerDown = (e) => {
    if (tool === 'hand') return
    if (mode === 'template') {
      if (e.button !== 0 && e.button !== 2) return
      const [x, y] = localPt(e)
      const edge = edgeAtPoint(x, y)
      if (!edge) return
      e.preventDefault()
      canvasRef.current.setPointerCapture(e.pointerId)
      // træk tegner altid (højre museknap visker ud); et enkelt klik slår kanten til/fra
      strokeRef.current = {
        corner: cornerAt(x, y),
        value: e.button === 2 ? 0 : 1,
        toggleValue: edgeValue(edge) ? 0 : 1,
        moved: false,
        firstEdge: edge,
      }
      return
    }
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
    if (mode === 'template') {
      const [x, y] = localPt(e)
      const s = strokeRef.current
      if (!s) {
        const edge = edgeAtPoint(x, y)
        if (!sameEdge(edge, hoverEdge)) setHoverEdge(edge)
        return
      }
      // træk: snap til gitterhjørner og markér kanterne mellem dem (trappe ved skrå træk)
      const target = cornerAt(x, y)
      if (target[0] === s.corner[0] && target[1] === s.corner[1]) return
      const edges = []
      let [r, c] = s.corner
      const [tr, tc] = target
      while (r !== tr || c !== tc) {
        const dr = tr - r
        const dc = tc - c
        if (Math.abs(dc) >= Math.abs(dr)) {
          const nc = c + Math.sign(dc)
          edges.push({ type: 'h', r, c: Math.min(c, nc) })
          c = nc
        } else {
          const nr = r + Math.sign(dr)
          edges.push({ type: 'v', r: Math.min(r, nr), c })
          r = nr
        }
      }
      s.corner = target
      const first = !s.moved
      s.moved = true
      if (edges.length) onEdges && onEdges(edges, { start: first, value: s.value })
      return
    }
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
    const s = strokeRef.current
    if (mode === 'template' && s && !s.moved) {
      // klik uden træk: slå den nærmeste kant til/fra
      onEdges && onEdges([s.firstEdge], { start: true, value: s.toggleValue })
    }
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
      onPointerLeave={() => setHoverEdge(null)}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
