import { useState } from 'react'
import { MAX_SIZE, resizeLoss, resizeOffset } from '../state'

// pilene i anker-gitteret peger væk fra ankeret – dér vokser lærredet
const ARROWS = ['↖', '↑', '↗', '←', '', '→', '↙', '↓', '↘']

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Beskriv ændringen på én side, fx "+4 masker til venstre" */
function sideText(n, one, many, side) {
  if (!n) return null
  return `${n > 0 ? '+' : '−'}${plural(Math.abs(n), one, many)} ${side}`
}

/**
 * Ny størrelse på lærredet. Tallene bruges først når man trykker Anvend/Enter, så mønstret ikke
 * beskæres mens man taster. Ankeret bestemmer hvilken side der vokser eller skæres af.
 *
 *  project  – projektet der ændres
 *  onApply  – (cols, rows, dr, dc) når størrelsen skal bruges
 *  onClose  – luk uden at ændre noget
 */
export default function CanvasSizeDialog({ project, onApply, onClose }) {
  const [cols, setCols] = useState(String(project.cols))
  const [rows, setRows] = useState(String(project.rows))
  // [ax, ay] – nederst til højre: rækker tælles nedefra og masker fra højre, så række 1 og maske 1 bliver stående
  const [anchor, setAnchor] = useState([2, 2])

  const size = (s) => Math.max(1, Math.min(MAX_SIZE, Number(s) | 0))
  const nc = size(cols)
  const nr = size(rows)
  const valid = Number(cols) >= 1 && Number(rows) >= 1
  const { dr, dc } = resizeOffset(project, nc, nr, anchor[0], anchor[1])
  const loss = resizeLoss(project, nc, nr, dr, dc)
  const changed = nc !== project.cols || nr !== project.rows

  const changes = [
    sideText(dc, 'maske', 'masker', 'til venstre'),
    sideText(nc - project.cols - dc, 'maske', 'masker', 'til højre'),
    sideText(dr, 'række', 'rækker', 'foroven'),
    sideText(nr - project.rows - dr, 'række', 'rækker', 'forneden'),
  ].filter(Boolean)

  const lost = [
    loss.cells && plural(loss.cells, 'felt med farve', 'felter med farve'),
    loss.edges && plural(loss.edges, 'kant', 'kanter'),
  ].filter(Boolean)

  const submit = (e) => {
    e.preventDefault()
    if (!valid || !changed) return
    if (lost.length || loss.notes) {
      const msg = [
        lost.length && `${lost.join(' og ')} forsvinder.`,
        loss.notes && `${plural(loss.notes, 'note', 'noter')} skubbes ind på lærredet.`,
      ]
        .filter(Boolean)
        .join(' ')
      if (!confirm(`${msg} Gør lærredet mindre alligevel?`)) return
    }
    onApply(nc, nr, dr, dc)
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={submit}
        // tasterne må ikke nå lærredets genveje mens dialogen er åben
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
        }}
      >
        <h3>Lærredets størrelse</h3>
        <p className="muted">
          Nu: {project.cols} masker × {project.rows} rækker
        </p>
        <div className="field-row">
          <label className="field col">
            <span>Masker (bredde)</span>
            <input
              className="input"
              type="number"
              min="1"
              max={MAX_SIZE}
              value={cols}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setCols(e.target.value)}
            />
          </label>
          <label className="field col">
            <span>Rækker (højde)</span>
            <input
              className="input"
              type="number"
              min="1"
              max={MAX_SIZE}
              value={rows}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setRows(e.target.value)}
            />
          </label>
        </div>

        <div className="anchor-row">
          <div className="anchor-grid" role="group" aria-label="Anker">
            {ARROWS.map((_, i) => {
              const ax = i % 3
              const ay = (i / 3) | 0
              const dx = ax - anchor[0]
              const dy = ay - anchor[1]
              const on = !dx && !dy
              const arrow = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? ARROWS[(dy + 1) * 3 + dx + 1] : ''
              return (
                <button
                  key={i}
                  type="button"
                  className={'anchor-cell' + (on ? ' on' : '')}
                  onClick={() => setAnchor([ax, ay])}
                  aria-pressed={on}
                  title="Indholdet bliver liggende her"
                >
                  {on ? '' : arrow}
                </button>
              )
            })}
          </div>
          <p className="muted">
            Vælg hvor mønstret skal blive liggende. Lærredet vokser eller skæres af i pilenes retning.
          </p>
        </div>

        {changed && valid && <p className="resize-summary">{changes.join(' · ')}</p>}
        {changed && valid && (lost.length > 0 || loss.notes > 0) && (
          <div className="stat warn">
            {lost.length > 0 && `${lost.join(' og ')} forsvinder. `}
            {loss.notes > 0 && `${plural(loss.notes, 'note', 'noter')} skubbes ind på lærredet.`}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn ghost small" onClick={onClose}>
            Annuller
          </button>
          <button type="submit" className="btn primary small" disabled={!valid || !changed}>
            Anvend
          </button>
        </div>
      </form>
    </div>
  )
}
