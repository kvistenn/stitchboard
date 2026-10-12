import { useLayoutEffect, useRef, useState } from 'react'

const MARGIN = 28 // samme margen som i GridCanvas
const WIDTH_CELLS = 8 // en note er ca. 8 felter bred

/**
 * Post-it-noter som HTML ovenpå lærredet. Placeringen er i gitterfelter, så noterne følger zoom.
 *
 * props:
 *  notes [{id,r,c,text}], cellSize
 *  editable           – skabelon-tilstand: kan flyttes, rettes og slettes; ellers kun visning (klik går igennem)
 *  focusId            – note der skal have fokus (lige oprettet)
 *  onUpdate(id, patch) – ny tekst eller placering
 *  onRemove(id)
 */
export default function NotesLayer({ notes, cellSize, editable, focusId, onUpdate, onRemove }) {
  if (!notes.length) return null
  return (
    <div className="notes-layer">
      {notes.map((n) => (
        <Note
          key={n.id}
          note={n}
          cs={cellSize}
          editable={editable}
          autoFocus={n.id === focusId}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function Note({ note, cs, editable, autoFocus, onUpdate, onRemove }) {
  const [text, setText] = useState(note.text)
  const [drag, setDrag] = useState(null) // {x,y,dr,dc} mens noten trækkes
  const areaRef = useRef(null)

  // ny tekst udefra (fx fortryd) når man ikke selv skriver i noten
  const [seen, setSeen] = useState(note.text)
  if (note.text !== seen) {
    setSeen(note.text)
    setText(note.text)
  }

  // tekstfeltet vokser med indholdet
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [text, cs, editable])

  useLayoutEffect(() => {
    if (autoFocus) areaRef.current?.focus()
  }, [autoFocus])

  const commitText = () => {
    if (!text.trim()) onRemove(note.id)
    else if (text !== note.text) onUpdate(note.id, { text })
  }

  // træk i top-kanten: flyt noten hele felter ad gangen
  const onGripDown = (e) => {
    if (e.target.closest('button')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY, dr: 0, dc: 0 })
  }
  const onGripMove = (e) => {
    if (!drag) return
    const dr = Math.round((e.clientY - drag.y) / cs)
    const dc = Math.round((e.clientX - drag.x) / cs)
    if (dr !== drag.dr || dc !== drag.dc) setDrag({ ...drag, dr, dc })
  }
  const onGripUp = () => {
    if (drag && (drag.dr || drag.dc)) onUpdate(note.id, { r: note.r + drag.dr, c: note.c + drag.dc })
    setDrag(null)
  }

  const r = note.r + (drag?.dr || 0)
  const c = note.c + (drag?.dc || 0)
  const style = {
    left: MARGIN + c * cs,
    top: MARGIN + r * cs,
    width: Math.max(110, WIDTH_CELLS * cs),
    fontSize: Math.max(11, Math.min(15, cs * 0.75)),
  }

  if (!editable)
    return (
      <div className="note readonly" style={style}>
        {note.text}
      </div>
    )

  return (
    <div className={'note' + (drag ? ' dragging' : '')} style={style}>
      <div
        className="note-grip"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        title="Træk for at flytte noten"
      >
        <button className="note-remove" onClick={() => onRemove(note.id)} title="Slet note" aria-label="Slet note">
          ×
        </button>
      </div>
      <textarea
        ref={areaRef}
        rows={1}
        value={text}
        placeholder="Skriv en note…"
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        aria-label="Note"
      />
    </div>
  )
}
