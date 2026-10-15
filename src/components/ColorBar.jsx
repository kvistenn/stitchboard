import { useEffect, useRef, useState } from 'react'
import { Plus, Check, Trash, Image, ChevronLeft, ChevronDown } from './Icons'
import ColorPicker from './ColorPicker'
import { colorName, addPaletteColor, addPaletteColors, renamePaletteColor, removeColor, clearColors } from '../state'
import { extractPalette } from '../colors'

const IMPORT_COUNTS = [4, 6, 8, 12, 16]

/** Pixels fra et billede, skaleret ned så optællingen går hurtigt */
function loadPixels(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, 200 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Billedet kunne ikke læses'))
    }
    img.src = url
  })
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

/**
 * Flydende farvebjælke nederst i midten.
 * Viser op til 5 senest brugte farver – × på en farve fjerner den fra bjælken. Klik = vælg.
 * "+" åbner paletten, hvor farverne kan navngives, slettes (også alle på én gang) og tilføjes.
 * onSelect(hex, base?) vælger en farve (i base, hvis paletten lige er ændret); onChange(project) gemmer paletten.
 * dock = 'bottom' (flydende nederst) eller 'side' (lodret strimmel ved værktøjsbjælken); onDock(dock) skifter.
 */
export default function ColorBar({ project, onSelect, onChange, dock = 'bottom', onDock }) {
  const side = dock === 'side'
  const [open, setOpen] = useState(false)
  const [newHex, setNewHex] = useState('#ff8800')
  const [newName, setNewName] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  // farver fundet i et billede: { hexes, picked: Set, count } – vises til valg før de tilføjes
  const [imported, setImported] = useState(null)
  const pixelsRef = useRef(null)
  const fileRef = useRef(null)
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

  // brugte farver der ikke er i paletten (fx fra før) vises også, så de kan få et navn
  const known = new Set(project.palette.map((p) => p.hex.toLowerCase()))
  const unsaved = recent.filter((hex) => hex && !known.has(hex.toLowerCase())).map((hex) => ({ hex, name: '' }))
  const entries = [...project.palette, ...unsaved]

  const addColor = () => {
    // vælges i det projekt der har den nye farve – ellers overskriver valget paletten
    onSelect(newHex.toLowerCase(), addPaletteColor(project, newHex, newName))
    setNewName('')
  }

  const rename = (hex, name) => onChange(renamePaletteColor(project, hex, name))

  const showImport = (count) => {
    const hexes = extractPalette(pixelsRef.current, count)
    setImported({ hexes, picked: new Set(hexes), count })
  }
  const importImage = async (file) => {
    if (!file) return
    try {
      pixelsRef.current = await loadPixels(file)
      showImport(imported?.count || 8)
    } catch (err) {
      alert(err.message)
    }
  }
  const togglePicked = (hex) => {
    const picked = new Set(imported.picked)
    if (picked.has(hex)) picked.delete(hex)
    else picked.add(hex)
    setImported({ ...imported, picked })
  }
  const addImported = () => {
    const hexes = imported.hexes.filter((hex) => imported.picked.has(hex))
    onChange(addPaletteColors(project, hexes).project)
    setImported(null)
    pixelsRef.current = null
  }

  // fra paletten (og bjælken) – det tegnede bliver stående
  const remove = (hex) => onChange(removeColor(project, hex))
  const removeAll = () => {
    if (confirm('Fjern alle farver fra paletten og bjælken? Det du har tegnet, bliver stående.'))
      onChange(clearColors(project))
  }

  return (
    <div className={'colorbar-wrap' + (side ? ' side' : '')} ref={wrapRef}>
      {open && (
        <div className="palette-pop">
          <div className="palette-pop-title">
            Garnfarver
            {entries.length > 0 && (
              <button className="btn ghost small" onClick={removeAll} title="Fjern alle farver og start forfra">
                <Trash width={14} height={14} /> Fjern alle
              </button>
            )}
          </div>
          {entries.length === 0 && <p className="muted palette-empty">Ingen farver endnu – tilføj en nedenfor.</p>}
          <div className="palette-list">
            {entries.map((p) => (
              <div key={p.hex} className={'palette-row' + (p.hex === current ? ' active' : '')}>
                <button
                  className="swatch"
                  style={{ background: p.hex }}
                  onClick={() => {
                    onSelect(p.hex)
                  }}
                  title={p.name || p.hex}
                >
                  {p.hex === current && (
                    <Check width={14} height={14} style={{ color: isLight(p.hex) ? '#111' : '#fff' }} />
                  )}
                </button>
                <input
                  className="palette-name"
                  value={p.name}
                  placeholder={p.hex}
                  onChange={(e) => rename(p.hex, e.target.value)}
                  title="Klik for at give farven et navn"
                  aria-label="Farvenavn"
                />
                <button className="icon-btn subtle" onClick={() => remove(p.hex)} title="Fjern farve">
                  <Trash width={16} height={16} />
                </button>
              </div>
            ))}
          </div>
          {pickerOpen && <ColorPicker value={newHex} onChange={setNewHex} />}
          <div className="palette-add">
            <button
              className={'swatch picker-toggle' + (pickerOpen ? ' active' : '')}
              style={{ background: newHex }}
              onClick={() => setPickerOpen((o) => !o)}
              title={pickerOpen ? 'Skjul farvevælgeren' : 'Vælg ny farve'}
              aria-label="Vælg ny farve"
              aria-expanded={pickerOpen}
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
          <div className="palette-import">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                importImage(e.target.files[0])
                e.target.value = ''
              }}
            />
            {!imported ? (
              <button className="btn ghost small" onClick={() => fileRef.current.click()}>
                <Image width={16} height={16} /> Hent farver fra billede
              </button>
            ) : (
              <>
                <div className="import-head">
                  <span>Farver i billedet</span>
                  <select
                    value={imported.count}
                    onChange={(e) => showImport(Number(e.target.value))}
                    aria-label="Antal farver"
                  >
                    {IMPORT_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n} farver
                      </option>
                    ))}
                  </select>
                </div>
                <div className="import-swatches">
                  {imported.hexes.map((hex) => {
                    const on = imported.picked.has(hex)
                    return (
                      <button
                        key={hex}
                        className={'swatch' + (on ? ' picked' : ' unpicked')}
                        style={{ background: hex }}
                        onClick={() => togglePicked(hex)}
                        title={hex + (known.has(hex) ? ' (findes allerede)' : '')}
                        aria-pressed={on}
                      >
                        {on && <Check width={14} height={14} style={{ color: isLight(hex) ? '#111' : '#fff' }} />}
                      </button>
                    )
                  })}
                </div>
                <div className="btn-row">
                  <button className="btn ghost small" onClick={() => fileRef.current.click()}>
                    Andet billede
                  </button>
                  <button className="btn ghost small" onClick={() => setImported(null)}>
                    Annullér
                  </button>
                  <button className="btn primary small" onClick={addImported} disabled={!imported.picked.size}>
                    Tilføj {imported.picked.size}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="colorbar">
        {recent.map((hex) => (
          <span key={hex} className="color-dot-wrap">
            <button
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
            <button
              className="color-dot-remove"
              onClick={() => onChange(removeColor(project, hex, false))}
              title="Fjern fra bjælken"
              aria-label={`Fjern ${colorName(project, hex)} fra bjælken`}
            >
              ×
            </button>
          </span>
        ))}
        {recent.length > 0 && <div className="colorbar-sep" />}
        <button
          className={'color-dot add' + (open ? ' active' : '')}
          onClick={() => setOpen((o) => !o)}
          title="Flere farver"
          aria-label="Flere farver"
        >
          <Plus />
        </button>
        {!side && <div className="colorbar-label">{current ? colorName(project, current) : 'Vælg en farve'}</div>}
        {onDock && (
          <button
            className="colorbar-dock"
            onClick={() => onDock(side ? 'bottom' : 'side')}
            title={side ? 'Flyt farverne ned i bunden' : 'Flyt farverne op ved værktøjerne'}
            aria-label={side ? 'Flyt farverne ned i bunden' : 'Flyt farverne op ved værktøjerne'}
          >
            {side ? <ChevronDown width={14} height={14} /> : <ChevronLeft width={14} height={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
