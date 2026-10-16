import { useLayoutEffect, useRef, useState } from 'react'

const MARGIN = 28 // samme margen som i GridCanvas

/**
 * Noter som tekst direkte på gitteret, som i et regneark: én linje er én række høj,
 * og teksten løber ud over felterne til højre – indtil et felt til højre selv har tekst, så klippes den
 * (som i Excel). Placeringen er i gitterfelter, så noterne følger zoom.
 *
 * props:
 *  notes [{id,r,c,text}], cellSize
 *  editable           – skabelon-tilstand: kan flyttes, rettes og slettes; ellers kun visning (klik går igennem)
 *  draftId            – noten er ny og endnu tom; den gemmes ved første tegn
 *  focus              – {id, n}: note der skal have fokus (n skifter for at give fokus igen)
 *  onUpdate(id, patch) – ny tekst eller placering
 *  onRemove(id)
 *  onNavigate(r, c)   – Enter/Tab: gå til feltet (r,c) – en note dér får fokus, ellers oprettes en ny
 *  colorAt(r, c)      – tekstfarven der står tydeligt på feltets farve
 */
export default function NotesLayer({ notes, cellSize, editable, draftId, focus, onUpdate, onRemove, onNavigate, colorAt }) {
  if (!notes.length) return null
  return (
    <div className="notes-layer">
      {notes.map((n) => (
        <Note
          key={n.id}
          note={n}
          cs={cellSize}
          limit={roomRight(notes, n)}
          editable={editable}
          isDraft={n.id === draftId}
          autoFocus={focus?.id === n.id}
          focusKey={focus?.n}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onNavigate={onNavigate}
          colorAt={colorAt}
        />
      ))}
    </div>
  )
}

const lineCount = (text) => text.split('\n').length

/** Antal felter noten må fylde mod højre, før den rammer en anden note med tekst i de samme rækker */
function roomRight(notes, note) {
  const r1 = note.r + lineCount(note.text) - 1
  let room = Infinity
  for (const o of notes) {
    if (o === note || o.c <= note.c || !o.text.trim()) continue
    if (o.r > r1 || o.r + lineCount(o.text) - 1 < note.r) continue
    room = Math.min(room, o.c - note.c)
  }
  return room
}

function Note({ note, cs, limit, editable, isDraft, autoFocus, focusKey, onUpdate, onRemove, onNavigate, colorAt }) {
  const [text, setText] = useState(note.text)
  const [focused, setFocused] = useState(false)
  const [drag, setDrag] = useState(null) // {x,y,dr,dc} mens noten trækkes
  const areaRef = useRef(null)

  // ny tekst udefra (fx fortryd) når man ikke selv skriver i noten
  const [seen, setSeen] = useState(note.text)
  if (note.text !== seen) {
    setSeen(note.text)
    setText(note.text)
  }

  // tekstfeltet er én kasse bredt og vokser med hele kasser, når teksten løber videre – som en celle
  // i Excel. Uden fokus klippes det ved næste note til højre. Højden vokser med en række pr. linje
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.width = '0'
    el.style.height = '0'
    const cells = Math.max(1, Math.ceil(el.scrollWidth / cs))
    el.style.width = (focused ? cells : Math.min(cells, limit)) * cs + 'px'
    el.style.height = el.scrollHeight + 'px'
  }, [text, cs, editable, focused, limit])

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!autoFocus || !el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus, focusKey])

  const commitText = () => {
    if (!text.trim()) onRemove(note.id)
    else if (text !== note.text) onUpdate(note.id, { text })
  }

  const onChange = (e) => {
    const v = e.target.value
    setText(v)
    // en ny note bliver en rigtig note så snart der står noget i den
    if (isDraft && v.trim()) onUpdate(note.id, { text: v })
  }

  // Enter gemmer og går til feltet under noten, Tab til feltet til højre (Shift går den anden vej).
  // Shift+Enter giver en ny linje i noten.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') return e.currentTarget.blur()
    const enter = e.key === 'Enter' && !e.shiftKey && !e.altKey
    if (!enter && e.key !== 'Tab') return
    e.preventDefault()
    commitText()
    if (enter) onNavigate(note.r + lineCount(text), note.c)
    else onNavigate(note.r, note.c + (e.shiftKey ? -1 : 1))
  }

  // træk i håndtaget: flyt noten hele felter ad gangen
  const onGripDown = (e) => {
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
    lineHeight: cs + 'px', // én tekstlinje = én række
    fontSize: Math.max(8, Math.min(15, cs * 0.72)),
    '--cs': cs + 'px',
    // teksten står direkte på felterne – mørk eller hvid efter farven i notens felt
    color: colorAt ? colorAt(r, c) : undefined,
  }

  if (!editable)
    return (
      <div className="note readonly" style={{ ...style, maxWidth: limit === Infinity ? undefined : limit * cs }}>
        {note.text}
      </div>
    )

  return (
    <div className={'note' + (drag ? ' dragging' : '') + (focused ? ' focused' : '')} style={style}>
      {/* håndtag til venstre for teksten – vises kun ved hover/fokus */}
      <div className="note-tools">
        <div
          className="note-grip"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          title="Træk for at flytte noten"
          aria-hidden="true"
        >
          ⠿
        </div>
        <button className="note-remove" onClick={() => onRemove(note.id)} title="Slet note" aria-label="Slet note">
          ×
        </button>
      </div>
      <textarea
        ref={areaRef}
        rows={1}
        wrap="off"
        spellCheck={false}
        value={text}
        placeholder="Skriv…"
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commitText()
        }}
        onKeyDown={onKeyDown}
        aria-label="Note"
      />
    </div>
  )
}
