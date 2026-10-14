import { useState } from 'react'
import { colorName, usedColors } from '../state'

/**
 * Erstat farve i mønster-tilstand: vælg en brugt farve og den farve den skal blive til (eller fjernes).
 * onReplace(from, to, onlyActive) – to = null fjerner farven. Med en markering erstattes kun i den.
 */
export default function ReplaceColorPanel({ project, active, hasSelection, onReplace }) {
  const [onlyActive, setOnlyActive] = useState(false)
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(undefined) // undefined = intet valgt, null = fjern farven

  const used = usedColors(project, onlyActive ? active : null)
  const fromHex = used.some((u) => u.hex === from) ? from : null
  const known = new Set(project.palette.map((p) => p.hex.toLowerCase()))
  const targets = [...project.palette.map((p) => p.hex.toLowerCase())]
  if (project.currentColor && !known.has(project.currentColor.toLowerCase())) targets.push(project.currentColor.toLowerCase())

  const replace = () => {
    onReplace(fromHex, to, onlyActive)
    setFrom(null)
    setTo(undefined)
  }

  return (
    <div className="replace-color">
      <div className="eyebrow">Erstat farve</div>
      {used.length === 0 ? (
        <p className="muted">Der er ingen farver at erstatte{onlyActive ? ' på laget' : ''}.</p>
      ) : (
        <>
          <div className="rc-label">Fra</div>
          <div className="rc-swatches">
            {used.map((u) => (
              <button
                key={u.hex}
                className={'swatch' + (u.hex === fromHex ? ' picked' : '')}
                style={{ background: u.hex }}
                onClick={() => setFrom(u.hex)}
                title={`${colorName(project, u.hex)} · ${u.count} felter`}
                aria-pressed={u.hex === fromHex}
              />
            ))}
          </div>
          <div className="rc-label">Til</div>
          <div className="rc-swatches">
            {targets.map((hex) => (
              <button
                key={hex}
                className={'swatch' + (hex === to ? ' picked' : '')}
                style={{ background: hex }}
                onClick={() => setTo(hex)}
                title={colorName(project, hex)}
                aria-pressed={hex === to}
              />
            ))}
            <button
              className={'swatch none' + (to === null ? ' picked' : '')}
              onClick={() => setTo(null)}
              title="Fjern farven (gennemsigtig)"
              aria-pressed={to === null}
            />
          </div>
        </>
      )}
      <label className="rc-check">
        <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        Kun på det aktive lag
      </label>
      {hasSelection && <p className="hint">Erstatter kun i markeringen.</p>}
      <button
        className="btn ghost small"
        disabled={!fromHex || to === undefined || to === fromHex}
        onClick={replace}
      >
        Erstat{fromHex && to !== undefined ? ` ${colorName(project, fromHex)} med ${to ? colorName(project, to) : 'ingenting'}` : ''}
      </button>
    </div>
  )
}
