import { useEffect, useRef, useState } from 'react'
import { Plus, Check, Trash } from './Icons'
import { colorName } from '../state'

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

/**
 * Flydende farvebjælke nederst i midten.
 * Viser de 5 senest brugte farver. Klik = vælg. "+" åbner paletten.
 */
export default function ColorBar({ project, onSelect, onUpdatePalette }) {
  const [open, setOpen] = useState(false)
  const [newHex, setNewHex] = useState('#ff8800')
  const [newName, setNewName] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open])

  const current = project.currentColor
  const recent = project.recent

  const addColor = () => {
    const hex = newHex.toLowerCase()
    const exists = project.palette.find((p) => p.hex.toLowerCase() === hex)
    const palette = exists
      ? project.palette
      : [...project.palette, { hex, name: newName.trim() || hex }]
    onUpdatePalette(palette)
    onSelect(hex)
    setNewName('')
  }

  const rename = (hex, name) => {
    onUpdatePalette(project.palette.map((p) => (p.hex === hex ? { ...p, name } : p)))
  }

  const remove = (hex) => {
    if (project.palette.length <= 1) return
    onUpdatePalette(project.palette.filter((p) => p.hex !== hex))
  }

  return (
    <div className="colorbar-wrap" ref={wrapRef}>
      {open && (
        <div className="palette-pop">
          <div className="palette-pop-title">Garnfarver</div>
          <div className="palette-list">
            {project.palette.map((p) => (
              <div key={p.hex} className={'palette-row' + (p.hex === current ? ' active' : '')}>
                <button
                  className="swatch"
                  style={{ background: p.hex }}
                  onClick={() => {
                    onSelect(p.hex)
                  }}
                  title={p.name}
                >
                  {p.hex === current && (
                    <Check width={14} height={14} style={{ color: isLight(p.hex) ? '#111' : '#fff' }} />
                  )}
                </button>
                <input
                  className="palette-name"
                  value={p.name}
                  onChange={(e) => rename(p.hex, e.target.value)}
                  aria-label="Farvenavn"
                />
                <button className="icon-btn subtle" onClick={() => remove(p.hex)} title="Fjern farve">
                  <Trash width={16} height={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="palette-add">
            <input
              type="color"
              value={newHex}
              onChange={(e) => setNewHex(e.target.value)}
              aria-label="Vælg ny farve"
            />
            <input
              className="palette-name"
              placeholder="Navn, fx Lyseblå"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColor()}
            />
            <button className="btn primary small" onClick={addColor}>
              Tilføj
            </button>
          </div>
        </div>
      )}

      <div className="colorbar">
        {recent.map((hex) => (
          <button
            key={hex}
            className={'color-dot' + (hex === current ? ' active' : '')}
            style={{ background: hex }}
            onClick={() => onSelect(hex)}
            title={colorName(project, hex)}
            aria-label={colorName(project, hex)}
          >
            {hex === current && (
              <Check width={16} height={16} style={{ color: isLight(hex) ? '#111' : '#fff' }} />
            )}
          </button>
        ))}
        <div className="colorbar-sep" />
        <button
          className={'color-dot add' + (open ? ' active' : '')}
          onClick={() => setOpen((o) => !o)}
          title="Flere farver"
          aria-label="Flere farver"
        >
          <Plus />
        </button>
        <div className="colorbar-label">{colorName(project, current)}</div>
      </div>
    </div>
  )
}
