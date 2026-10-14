import { useLayoutEffect, useRef, useState } from 'react'
import { MAX_SIZE } from '../state'

const MARGIN = 28 // samme margen som i GridCanvas

/**
 * Et indsat billede oven på lærredet. Det ligger altid på hele felter: træk i det for at flytte det,
 * og i hjørnet for at ændre størrelsen (med bevaret forhold, hvis keep). Med hexes vises det som felter.
 *
 * props:
 *  image { url, img, r0, c0, w, h, keep, opacity }
 *  hexes   – w×h farver der vises i stedet for billedet (forhåndsvisning), ellers null
 *  cellSize
 *  onChange(patch)
 */
export default function ImageOverlay({ image, hexes, cellSize: cs, onChange }) {
  const [drag, setDrag] = useState(null) // { kind: 'move'|'size', x, y, start: {r0,c0,w,h} }
  const previewRef = useRef(null)
  const { r0, c0, w, h } = image

  useLayoutEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !hexes) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    hexes.forEach((hex, i) => {
      if (!hex) return
      ctx.fillStyle = hex
      ctx.fillRect(i % w, (i / w) | 0, 1, 1)
    })
  }, [hexes, w, h])

  const start = (kind) => (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind, x: e.clientX, y: e.clientY, start: { r0, c0, w, h } })
  }
  const move = (e) => {
    if (!drag) return
    const dc = Math.round((e.clientX - drag.x) / cs)
    const dr = Math.round((e.clientY - drag.y) / cs)
    const s = drag.start
    if (drag.kind === 'move') {
      if (s.r0 + dr !== r0 || s.c0 + dc !== c0) onChange({ r0: s.r0 + dr, c0: s.c0 + dc })
      return
    }
    const nw = Math.max(1, Math.min(MAX_SIZE, s.w + dc))
    const nh = image.keep
      ? Math.max(1, Math.min(MAX_SIZE, Math.round((nw * image.img.naturalHeight) / image.img.naturalWidth)))
      : Math.max(1, Math.min(MAX_SIZE, s.h + dr))
    if (nw !== w || nh !== h) onChange({ w: nw, h: nh })
  }
  const end = () => setDrag(null)

  return (
    <div
      className={'image-overlay' + (drag ? ' dragging' : '')}
      style={{ left: MARGIN + c0 * cs, top: MARGIN + r0 * cs, width: w * cs, height: h * cs }}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      title="Træk for at flytte billedet"
    >
      {hexes ? (
        <canvas ref={previewRef} width={w} height={h} className="image-preview" />
      ) : (
        <img src={image.url} alt="" draggable={false} style={{ opacity: image.opacity }} />
      )}
      <div
        className="image-size-handle"
        onPointerDown={start('size')}
        title="Træk for at ændre størrelsen"
      />
      <span className="image-size-label">
        {w} m × {h} r
      </span>
    </div>
  )
}
