import { MAX_SIZE } from '../state'

const COUNTS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 24]

const size = (v) => Math.max(1, Math.min(MAX_SIZE, Number(v) || 1))

/**
 * Indstillinger for et indsat billede: størrelse i felter, gennemsigtighed, antal farver og om kun
 * palettens farver bruges. onChange(patch), onApply() pixelerer, onCancel() fjerner billedet.
 */
export default function ImagePanel({ image, hasTemplate, layerName, onChange, onApply, onCancel }) {
  const ratio = image.img.naturalHeight / image.img.naturalWidth
  const setW = (v) => {
    const w = size(v)
    onChange(image.keep ? { w, h: size(Math.round(w * ratio)) } : { w })
  }
  const setH = (v) => {
    const h = size(v)
    onChange(image.keep ? { h, w: size(Math.round(h / ratio)) } : { h })
  }
  return (
    <div className="panel image-panel">
      <h3>Billede</h3>
      <p className="muted">
        Træk i billedet for at flytte det og i hjørnet for at ændre størrelsen. Hvert felt får billedets farve,
        når du pixelerer.
      </p>
      <div className="image-size">
        <label>
          Masker
          <input type="number" min="1" max={MAX_SIZE} value={image.w} onChange={(e) => setW(e.target.value)} />
        </label>
        <span>×</span>
        <label>
          Rækker
          <input type="number" min="1" max={MAX_SIZE} value={image.h} onChange={(e) => setH(e.target.value)} />
        </label>
      </div>
      <label className="rc-check">
        <input type="checkbox" checked={image.keep} onChange={(e) => onChange({ keep: e.target.checked })} />
        Bevar billedets forhold
      </label>
      <label className="image-row">
        Farver
        <select value={image.count} onChange={(e) => onChange({ count: Number(e.target.value) })}>
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="rc-check">
        <input
          type="checkbox"
          checked={image.paletteOnly}
          onChange={(e) => onChange({ paletteOnly: e.target.checked })}
        />
        Brug kun farverne i paletten
      </label>
      {hasTemplate && (
        <label className="rc-check">
          <input
            type="checkbox"
            checked={image.insideOnly}
            onChange={(e) => onChange({ insideOnly: e.target.checked })}
          />
          Kun indenfor skabelonen
        </label>
      )}
      <label className="rc-check">
        <input type="checkbox" checked={image.preview} onChange={(e) => onChange({ preview: e.target.checked })} />
        Vis som felter
      </label>
      {!image.preview && (
        <label className="image-row">
          Synlighed
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={image.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
        </label>
      )}
      <div className="btn-row">
        <button className="btn ghost small" onClick={onCancel}>
          Fjern billede
        </button>
        <button className="btn primary small" onClick={onApply}>
          Pixelér
        </button>
      </div>
      <p className="hint">
        Felterne lægges på et nyt lag, "Billede", over {layerName}
        {image.paletteOnly ? '.' : ', og farverne kommer i paletten.'}
      </p>
    </div>
  )
}
