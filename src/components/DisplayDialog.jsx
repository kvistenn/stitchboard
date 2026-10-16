import { DISPLAY_DEFAULTS } from '../display'

/**
 * Visningsindstillinger for lærredet. Ændringerne slår igennem med det samme.
 *  display, onChange(display), onClose
 */
export default function DisplayDialog({ display, onChange, onClose }) {
  const set = (patch) => onChange({ ...display, ...patch })
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog display-dialog"
        role="dialog"
        aria-label="Visning"
        // tasterne må ikke nå lærredets genveje mens dialogen er åben
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
        }}
      >
        <h3>Visning</h3>
        <p className="muted">Gælder alle projekter i denne browser.</p>

        <div className="display-row">
          <span className="display-label">Felter</span>
          <div className="segmented" role="radiogroup" aria-label="Felter">
            {[
              ['pixel', 'Pixels'],
              ['stitch', 'Masker'],
            ].map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={display.cellStyle === id}
                className={display.cellStyle === id ? 'on' : ''}
                onClick={() => set({ cellStyle: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="display-row">
          <span className="display-label">Gitterlinjer</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={display.gridWidth}
            onChange={(e) => set({ gridWidth: Number(e.target.value) })}
          />
          <span className="display-value">{display.gridWidth ? `${display.gridWidth} px` : 'Ingen'}</span>
        </label>

        <label className="display-row">
          <span className="display-label">Skabelonkant</span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={display.edgeWidth}
            onChange={(e) => set({ edgeWidth: Number(e.target.value) })}
          />
          <span className="display-value">{display.edgeWidth ? `${display.edgeWidth} px` : 'Auto'}</span>
        </label>

        <label className="display-check">
          <input
            type="checkbox"
            checked={display.knitHideOutside}
            onChange={(e) => set({ knitHideOutside: e.target.checked })}
          />
          <span>
            Fjern kanter udenfor skabelonen i <b>Strik</b>
            <small>Gitterlinjer og løse kanter udenfor skabelonen vises ikke, mens du strikker.</small>
          </span>
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn ghost small" onClick={() => onChange({ ...DISPLAY_DEFAULTS })}>
            Nulstil
          </button>
          <button type="button" className="btn primary small" onClick={onClose}>
            Luk
          </button>
        </div>
      </div>
    </div>
  )
}
