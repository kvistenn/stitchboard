import { useLayoutEffect, useRef } from 'react'
import { cellsOnLine, hIdx, vIdx, moveCells, moveTemplate } from '../state'

const MARGIN = 28 // plads til række-/maskenumre
const OUTSIDE = '#e9ecf1' // bund udenfor skabelonen

/**
 * Tegner gridet på et canvas og håndterer tegning med mus/finger.
 *
 * Under et strøg tegnes ændringerne kun lokalt på canvas – projektet opdateres først når man slipper.
 * Det holder tegningen flydende, fordi React ikke skal rendere hele editoren for hver musebevægelse.
 *
 * props:
 *  project, mode ('template'|'pattern'|'knit'), tool, cellSize
 *  highlight: { current:[{r,c0,c1}], done:[{r,c0,c1}], seg:{r,c0,c1}|null, labels:[{r,c,n,current}] } (strik-tilstand)
 *  cursorCell: [r,c] sidst udfyldte felt (mønster-tilstand)
 *  selection: { r0,c0,r1,c1 } markering (mønster-tilstand)
 *  templates: findTemplates(project) – de enkelte skabeloner på lærredet
 *  onPaint(cells[[r,c]...])        – pen/viskelæder, kaldes én gang når strøget slutter
 *  onRect(r0,c0,r1,c1)             – udfyld rektangel
 *  onFill(r,c)                     – spand
 *  onCellClick(r,c)                – klik i strik-tilstand
 *  onEdges(edges[{type,r,c}], value) – kant-pennen i skabelon-tilstand
 *  onSelect(sel|null)              – ny markering
 *  onMoveSelection(dr,dc)          – flyt markeringens indhold
 *  onMoveTemplate(t,dr,dc)         – flyt en hel skabelon (Flyt rundt i skabelon-tilstand; i mønster-tilstand kun lærredet)
 */
export default function GridCanvas({
  project,
  mode,
  tool,
  cellSize,
  highlight,
  cursorCell,
  selection,
  templates,
  onPaint,
  onRect,
  onFill,
  onCellClick,
  onEdges,
  onSelect,
  onMoveSelection,
  onMoveTemplate,
}) {
  const canvasRef = useRef(null)
  const liveRef = useRef(null) // igangværende strøg/træk
  const rafRef = useRef(0)

  const { cols, rows } = project
  const width = cols * cellSize + MARGIN * 2
  const height = rows * cellSize + MARGIN * 2

  const propsRef = useRef(null)
  propsRef.current = { project, mode, cellSize, highlight, cursorCell, selection, templates }

  // ---- tegning -------------------------------------------------------
  const draw = () => {
    rafRef.current = 0
    const canvas = canvasRef.current
    if (!canvas) return
    const { project, mode, cellSize: cs, highlight, cursorCell, selection, templates } = propsRef.current
    const { cols, rows } = project
    const live = liveRef.current
    let { colors, hEdges, vEdges, shape } = project
    if (live?.kind === 'paint') colors = live.colors
    if (live?.kind === 'move') colors = live.colors
    if (live?.kind === 'edges') ({ hEdges, vEdges } = live)
    if (live?.kind === 'tmove' && live.preview) ({ colors, hEdges, vEdges, shape } = live.preview)

    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    const ox = MARGIN
    const oy = MARGIN
    const gw = cols * cs
    const gh = rows * cs

    // celler: hvid bund, derefter kun felter der afviger
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(ox, oy, gw, gh)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const fill = shape[i] ? colors[i] : colors[i] || OUTSIDE
        if (!fill || fill === '#ffffff') continue
        ctx.fillStyle = fill
        ctx.fillRect(ox + c * cs, oy + r * cs, cs, cs)
      }
    }
    // kladde udenfor skabelonen: farverne vises en anelse svagere
    ctx.fillStyle = 'rgba(233,236,241,0.35)'
    ctx.beginPath()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (!shape[i] && colors[i]) ctx.rect(ox + c * cs, oy + r * cs, cs, cs)
      }
    }
    ctx.fill()

    // gitterlinjer – samlet i to stier (tynde og hver 10.)
    ctx.lineWidth = 1
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? 'rgba(15,23,42,0.35)' : 'rgba(15,23,42,0.12)'
      ctx.beginPath()
      for (let c = 0; c <= cols; c++) {
        if ((c % 10 === 0) !== major) continue
        const x = ox + c * cs + 0.5
        ctx.moveTo(x, oy)
        ctx.lineTo(x, oy + gh)
      }
      for (let r = 0; r <= rows; r++) {
        if ((r % 10 === 0) !== major) continue
        const y = oy + r * cs + 0.5
        ctx.moveTo(ox, y)
        ctx.lineTo(ox + gw, y)
      }
      ctx.stroke()
    }

    // skabelonens kant: de sorte streger brugeren har tegnet
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

    // strik-tilstand: dæmp alt undtagen de aktuelle rækker i de valgte skabeloner
    if (mode === 'knit' && highlight) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.rect(ox, oy, gw, gh)
      for (const s of highlight.current) ctx.rect(ox + s.c0 * cs, oy + s.r * cs, (s.c1 - s.c0 + 1) * cs, cs)
      ctx.fill('evenodd')
      ctx.fillStyle = 'rgba(34,197,94,0.22)'
      for (const s of highlight.done) ctx.fillRect(ox + s.c0 * cs, oy + s.r * cs, (s.c1 - s.c0 + 1) * cs, cs)
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 3
      for (const s of highlight.current)
        ctx.strokeRect(ox + s.c0 * cs - 1.5, oy + s.r * cs - 1.5, (s.c1 - s.c0 + 1) * cs + 3, cs + 3)
      if (highlight.seg) {
        const s = highlight.seg
        ctx.strokeStyle = '#00c4cc'
        ctx.lineWidth = 4
        ctx.strokeRect(ox + s.c0 * cs + 2, oy + s.r * cs + 2, (s.c1 - s.c0 + 1) * cs - 4, cs - 4)
      }
    }

    // markør: sidst udfyldte felt (piletaster udfylder herfra)
    if (cursorCell && !selection) {
      const [cr, cc] = cursorCell
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 3
      ctx.strokeRect(ox + cc * cs + 1.5, oy + cr * cs + 1.5, cs - 3, cs - 3)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(ox + cc * cs + 3.5, oy + cr * cs + 3.5, cs - 7, cs - 7)
    }

    // udfyld-forhåndsvisning
    if (live?.kind === 'rect') {
      const s = norm(live)
      ctx.fillStyle = 'rgba(125,42,232,0.25)'
      ctx.fillRect(ox + s.c0 * cs, oy + s.r0 * cs, (s.c1 - s.c0 + 1) * cs, (s.r1 - s.r0 + 1) * cs)
      ctx.strokeStyle = '#7d2ae8'
      ctx.lineWidth = 2
      ctx.strokeRect(ox + s.c0 * cs, oy + s.r0 * cs, (s.c1 - s.c0 + 1) * cs, (s.r1 - s.r0 + 1) * cs)
    }

    // markering (stiplet ramme)
    let sel = live?.kind === 'select' ? norm(live) : selection
    if (sel && live?.kind === 'move') sel = shift(sel, live.dr, live.dc)
    if (sel) {
      const x = ox + sel.c0 * cs
      const y = oy + sel.r0 * cs
      const w = (sel.c1 - sel.c0 + 1) * cs
      const h = (sel.r1 - sel.r0 + 1) * cs
      ctx.fillStyle = 'rgba(125,42,232,0.08)'
      ctx.fillRect(x, y, w, h)
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(x, y, w, h)
      ctx.lineDashOffset = 5
      ctx.strokeStyle = '#7d2ae8'
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }

    // numre i margen
    const fontPx = Math.max(8, Math.min(12, cs * 0.7))
    ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const step = cs >= 14 ? 5 : 10
    for (let c = 0; c < cols; c++) {
      const n = cols - c // masker tælles fra højre som i strikkediagrammer
      if (n % step === 0 || n === 1) ctx.fillText(String(n), ox + c * cs + cs / 2, oy + gh + MARGIN / 2)
    }
    const label = (r, text) => {
      const y = oy + r * cs + cs / 2
      ctx.textAlign = 'right'
      ctx.fillText(text, ox - 6, y)
      ctx.textAlign = 'left'
      ctx.fillText(text, ox + gw + 6, y)
    }
    if (mode === 'knit' && highlight) {
      // strik: nummer ved hver række, lige til venstre for skabelonen (samme nummer som "Række X af Y")
      const every = cs >= 9 ? 1 : 5
      ctx.textAlign = 'right'
      for (const { r, c, n, current } of highlight.labels) {
        if (!current && n % every !== 0 && n !== 1) continue
        ctx.font = `${current ? '700 ' : ''}${fontPx}px ui-sans-serif, system-ui, sans-serif`
        ctx.fillStyle = current ? '#7d2ae8' : '#64748b'
        ctx.fillText(String(n), ox + c * cs - 5, oy + r * cs + cs / 2)
      }
    } else {
      for (let r = 0; r < rows; r++) {
        const n = rows - r // rækker tælles nedefra
        if (n % step === 0 || n === 1) label(r, String(n))
      }
    }

    // navne på skabelonerne (ikke under flytning, hvor de gamle pladser er misvisende)
    if (mode !== 'pattern' && live?.kind !== 'tmove') drawNames(ctx, templates, cs)
  }

  const drawNames = (ctx, templates, cs) => {
    if (!templates || templates.list.length < 2) return
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    for (const t of templates.list) {
      const x = MARGIN + t.c0 * cs
      const y = MARGIN + t.r0 * cs - 4
      const w = ctx.measureText(t.name).width + 10
      ctx.fillStyle = 'rgba(125,42,232,0.92)'
      ctx.beginPath()
      ctx.roundRect(x, y - 15, w, 16, 5)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(t.name, x + 5, y - 1)
    }
  }

  const requestDraw = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(draw)
  }

  // canvas-størrelsen sættes kun når den ændrer sig (at sætte width rydder og er dyrt)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
  }, [width, height])

  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current)
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, mode, cellSize, highlight, cursorCell, selection, templates, width, height])

  useLayoutEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // ---- input -----------------------------------------------------------
  const localPt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [e.clientX - rect.left - MARGIN, e.clientY - rect.top - MARGIN]
  }
  const clampCell = (x, y) => [
    Math.max(0, Math.min(rows - 1, Math.floor(y / cellSize))),
    Math.max(0, Math.min(cols - 1, Math.floor(x / cellSize))),
  ]
  const cellAt = (e) => {
    const [x, y] = localPt(e)
    const c = Math.floor(x / cellSize)
    const r = Math.floor(y / cellSize)
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null
    return [r, c]
  }

  /** Nærmeste kant til et punkt (px relativt til gridets øverste venstre hjørne) */
  const edgeAtPoint = (x, y) => {
    const cs = cellSize
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
  }
  const cornerAt = (x, y) => [
    Math.max(0, Math.min(rows, Math.round(y / cellSize))),
    Math.max(0, Math.min(cols, Math.round(x / cellSize))),
  ]
  const edgeValue = (e) =>
    e.type === 'h' ? project.hEdges[hIdx(cols, e.r, e.c)] : project.vEdges[vIdx(cols, e.r, e.c)]
  // skabelonen under markøren – ikke hvis den fylder hele gridet (så er der intet at flytte)
  const templateAt = (e) => {
    const cell = cellAt(e)
    if (!cell || !templates) return null
    const k = templates.comp[cell[0] * cols + cell[1]]
    const t = k >= 0 ? templates.list[k] : null
    return t && t.cells.length < cols * rows ? t : null
  }
  const inSel = (r, c) => selection && r >= selection.r0 && r <= selection.r1 && c >= selection.c0 && c <= selection.c1

  const onPointerDown = (e) => {
    const canvas = canvasRef.current
    if (tool === 'hand' && mode !== 'knit') {
      // Flyt rundt: træk en skabelon – eller lærredet, hvis man trækker ved siden af.
      // I mønster-tilstand flytter den kun lærredet, så skabelonerne ikke flyttes ved et uheld.
      const t = mode === 'template' ? templateAt(e) : null
      if (t) {
        e.preventDefault()
        canvas.setPointerCapture(e.pointerId)
        liveRef.current = { kind: 'tmove', t, start: cellAt(e), dr: 0, dc: 0, preview: null }
        return
      }
      const el = canvas.closest('.canvas-scroll-outer')
      if (!el) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      liveRef.current = { kind: 'pan', el, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      canvas.style.cursor = 'grabbing'
      return
    }
    if (mode === 'template') {
      if (e.button !== 0 && e.button !== 2) return
      const [x, y] = localPt(e)
      const edge = edgeAtPoint(x, y)
      if (!edge) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      // træk tegner altid (højre museknap visker ud); et enkelt klik slår kanten til/fra
      liveRef.current = {
        kind: 'edges',
        hEdges: project.hEdges.slice(),
        vEdges: project.vEdges.slice(),
        changed: [],
        corner: cornerAt(x, y),
        value: e.button === 2 ? 0 : 1,
        toggleValue: edgeValue(edge) ? 0 : 1,
        firstEdge: edge,
      }
      return
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const cell = cellAt(e)
    if (!cell) {
      if (tool === 'select' && selection) onSelect(null)
      return
    }
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    const [r, c] = cell
    if (mode === 'knit') {
      onCellClick && onCellClick(r, c)
      return
    }
    if (tool === 'select') {
      liveRef.current = inSel(r, c)
        ? { kind: 'move', start: [r, c], dr: 0, dc: 0, colors: project.colors }
        : { kind: 'select', r0: r, c0: c, r1: r, c1: c }
      requestDraw()
      return
    }
    if (tool === 'rect') {
      liveRef.current = { kind: 'rect', r0: r, c0: c, r1: r, c1: c }
      requestDraw()
      return
    }
    if (tool === 'fill') {
      onFill && onFill(r, c)
      return
    }
    const live = {
      kind: 'paint',
      colors: project.colors.slice(),
      value: tool === 'eraser' ? null : project.currentColor,
      last: [r, c],
      cells: [],
    }
    liveRef.current = live
    paintLive(live, [[r, c]])
  }

  const paintLive = (live, cells) => {
    for (const [r, c] of cells) {
      live.colors[r * cols + c] = live.value
      live.cells.push([r, c])
    }
    requestDraw()
  }

  const onPointerMove = (e) => {
    const live = liveRef.current
    if (!live) {
      // vis flyt-markør over markeringen
      if (tool === 'select') {
        const cell = cellAt(e)
        canvasRef.current.style.cursor = cell && inSel(cell[0], cell[1]) ? 'move' : 'crosshair'
      } else if (tool === 'hand' && mode === 'template') {
        canvasRef.current.style.cursor = templateAt(e) ? 'move' : 'grab'
      }
      return
    }
    if (live.kind === 'pan') {
      live.el.scrollLeft = live.sl - (e.clientX - live.x)
      live.el.scrollTop = live.st - (e.clientY - live.y)
      return
    }
    const [x, y] = localPt(e)
    if (live.kind === 'edges') {
      // træk: snap til gitterhjørner og markér kanterne mellem dem (trappe ved skrå træk)
      const target = cornerAt(x, y)
      let [r, c] = live.corner
      const [tr, tc] = target
      if (r === tr && c === tc) return
      while (r !== tr || c !== tc) {
        const dr = tr - r
        const dc = tc - c
        let edge
        if (Math.abs(dc) >= Math.abs(dr)) {
          const nc = c + Math.sign(dc)
          edge = { type: 'h', r, c: Math.min(c, nc) }
          live.hEdges[hIdx(cols, edge.r, edge.c)] = live.value
          c = nc
        } else {
          const nr = r + Math.sign(dr)
          edge = { type: 'v', r: Math.min(r, nr), c }
          live.vEdges[vIdx(cols, edge.r, edge.c)] = live.value
          r = nr
        }
        live.changed.push(edge)
      }
      live.corner = target
      requestDraw()
      return
    }
    const [r, c] = clampCell(x, y)
    if (live.kind === 'rect' || live.kind === 'select') {
      if (r !== live.r1 || c !== live.c1) {
        live.r1 = r
        live.c1 = c
        requestDraw()
      }
      return
    }
    if (live.kind === 'tmove') {
      const { t } = live
      const dr = Math.max(-t.r0, Math.min(rows - 1 - t.r1, r - live.start[0]))
      const dc = Math.max(-t.c0, Math.min(cols - 1 - t.c1, c - live.start[1]))
      if (dr !== live.dr || dc !== live.dc) {
        live.dr = dr
        live.dc = dc
        live.preview = dr || dc ? moveTemplate(project, templates, t, dr, dc) : null
        requestDraw()
      }
      return
    }
    if (live.kind === 'move') {
      // hold markeringen indenfor gridet
      const dr = Math.max(-selection.r0, Math.min(rows - 1 - selection.r1, r - live.start[0]))
      const dc = Math.max(-selection.c0, Math.min(cols - 1 - selection.c1, c - live.start[1]))
      if (dr !== live.dr || dc !== live.dc) {
        live.dr = dr
        live.dc = dc
        live.colors = dr || dc ? moveCells(project, selection, dr, dc) : project.colors
        requestDraw()
      }
      return
    }
    if (live.kind === 'paint') {
      if (r === live.last[0] && c === live.last[1]) return
      const line = cellsOnLine(live.last[0], live.last[1], r, c).slice(1)
      live.last = [r, c]
      paintLive(live, line)
    }
  }

  const onPointerUp = () => {
    const live = liveRef.current
    liveRef.current = null
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    if (!live) return
    switch (live.kind) {
      case 'pan':
        canvasRef.current.style.cursor = 'grab'
        return
      case 'edges':
        // klik uden træk: slå den nærmeste kant til/fra
        if (live.changed.length) onEdges(live.changed, live.value)
        else onEdges([live.firstEdge], live.toggleValue)
        break
      case 'paint':
        onPaint(live.cells)
        break
      case 'rect':
        onRect(live.r0, live.c0, live.r1, live.c1)
        break
      case 'select':
        onSelect(norm(live))
        break
      case 'move':
        if (live.dr || live.dc) onMoveSelection(live.dr, live.dc)
        break
      case 'tmove':
        if (live.dr || live.dc) onMoveTemplate(live.t, live.dr, live.dc)
        break
    }
    // tegn igen hvis forælderen ikke ændrede noget (fx klik uden effekt)
    requestDraw()
  }

  const cursor = tool === 'hand' && mode !== 'knit' ? 'grab' : mode === 'knit' ? 'pointer' : 'crosshair'

  return (
    <canvas
      ref={canvasRef}
      className="grid-canvas"
      style={{ cursor, touchAction: mode === 'knit' ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}

function norm(s) {
  return {
    r0: Math.min(s.r0, s.r1),
    r1: Math.max(s.r0, s.r1),
    c0: Math.min(s.c0, s.c1),
    c1: Math.max(s.c0, s.c1),
  }
}

function shift(s, dr, dc) {
  return { r0: s.r0 + dr, r1: s.r1 + dr, c0: s.c0 + dc, c1: s.c1 + dc }
}
