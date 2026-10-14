import { useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Eye, EyeOff, Plus, Trash, Copy } from './Icons'

/**
 * Lagliste i mønster-tilstand. Øverste lag vises øverst; k er indekset i project.layers (nederste = 0).
 * Dobbeltklik (eller langt tryk på mobil) på navnet for at omdøbe.
 */
export default function LayersPanel({ layers, active, onSelect, onToggle, onRename, onMove, onRemove, onAdd, onDuplicate, onMergeDown }) {
  const [editing, setEditing] = useState(null) // k for laget der omdøbes
  const pressRef = useRef(0)

  const startPress = (k) => {
    clearTimeout(pressRef.current)
    pressRef.current = setTimeout(() => setEditing(k), 500)
  }
  const endPress = () => clearTimeout(pressRef.current)

  const rows = layers.map((l, k) => ({ l, k })).reverse()
  return (
    <div className="layers">
      <div className="eyebrow">Lag</div>
      <ul className="layer-list">
        {rows.map(({ l, k }) => (
          <li
            key={l.id}
            className={'layer-row' + (k === active ? ' active' : '') + (l.visible ? '' : ' hidden')}
            onClick={() => onSelect(k)}
          >
            <button
              className="icon-btn small"
              onClick={(e) => (e.stopPropagation(), onToggle(k))}
              title={l.visible ? 'Skjul lag' : 'Vis lag'}
              aria-label={l.visible ? 'Skjul lag' : 'Vis lag'}
            >
              {l.visible ? <Eye width={16} height={16} /> : <EyeOff width={16} height={16} />}
            </button>
            {editing === k ? (
              <input
                className="layer-name-input"
                defaultValue={l.name}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => (onRename(k, e.target.value), setEditing(null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
                aria-label="Lagets navn"
              />
            ) : (
              <span
                className="layer-name"
                onDoubleClick={() => setEditing(k)}
                onPointerDown={() => startPress(k)}
                onPointerUp={endPress}
                onPointerLeave={endPress}
              >
                {l.name}
              </span>
            )}
            <button
              className="icon-btn small"
              disabled={k === layers.length - 1}
              onClick={(e) => (e.stopPropagation(), onMove(k, 1))}
              title="Flyt op"
              aria-label="Flyt laget op"
            >
              <ChevronUp width={16} height={16} />
            </button>
            <button
              className="icon-btn small"
              disabled={k === 0}
              onClick={(e) => (e.stopPropagation(), onMove(k, -1))}
              title="Flyt ned"
              aria-label="Flyt laget ned"
            >
              <ChevronDown width={16} height={16} />
            </button>
            <button
              className="icon-btn small"
              disabled={layers.length <= 1}
              onClick={(e) => (e.stopPropagation(), onRemove(k))}
              title="Slet lag"
              aria-label="Slet lag"
            >
              <Trash width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button className="btn ghost small" onClick={onAdd}>
          <Plus width={16} height={16} /> Nyt lag
        </button>
        <button className="btn ghost small" onClick={onDuplicate}>
          <Copy width={16} height={16} /> Dupliker
        </button>
        <button
          className="btn ghost small"
          onClick={onMergeDown}
          disabled={active === 0}
          title={active === 0 ? 'Der er intet lag under' : `Flet "${layers[active].name}" ned i "${layers[active - 1].name}"`}
        >
          <ChevronDown width={16} height={16} /> Flet ned
        </button>
      </div>
    </div>
  )
}
