import { colorName } from '../state'
import { sequenceLength } from '../pooling'
import { Plus, Trash } from './Icons'

/**
 * Planned pooling i mønster-tilstand: garnets farveforløb lægges ud maske for maske i området.
 *  project, settings ({sequence:[{hex,count}], direction, offset}), onChange(settings)
 *  area      – beskrivelse af området, fx "markeringen"
 *  widest    – maskeantallet i områdets bredeste række
 *  updating  – det aktive lag er det sidst genererede: Generér opdaterer det i stedet for at lave et nyt
 *  onApply()
 */
export default function PoolingPanel({ project, settings, onChange, area, widest, updating, onApply }) {
  const { sequence, direction, offset } = settings
  const length = sequenceLength(sequence)
  const set = (patch) => onChange({ ...settings, ...patch })
  const setStep = (k, patch) => set({ sequence: sequence.map((s, j) => (j === k ? { ...s, ...patch } : s)) })
  const palette = project.palette.length ? project.palette : [{ hex: '#ffffff', name: 'Hvid' }]
  const addStep = () => {
    const used = new Set(sequence.map((s) => s.hex.toLowerCase()))
    const next = palette.find((p) => !used.has(p.hex.toLowerCase())) || palette[0]
    set({ sequence: [...sequence, { hex: next.hex, count: 3 }] })
  }

  // maskeantallet i forhold til forløbet bestemmer mønsteret: tæt på forløbets længde giver de skrå striber
  const diff = widest - length
  const advice =
    !length || !widest
      ? null
      : diff === 0
        ? 'Rækken er præcis ét forløb – farverne stables lodret.'
        : Math.abs(diff) <= 2
          ? `Rækken er ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'maske' : 'masker'} ${diff > 0 ? 'længere' : 'kortere'} end forløbet – det giver skrå striber${direction === 'flat' ? ' og argyle' : ''}.`
          : `Prøv med ${length - 1}, ${length} eller ${length + 1} masker pr. række for det klassiske mønster.`

  return (
    <details className="pooling">
      <summary className="eyebrow">Planned pooling</summary>
      <p className="muted">
        Skriv garnets farveforløb – fx 5 m blå, 2 m hvid – og læg det ud maske for maske i {area}, som garnet ville
        strikke det.
      </p>
      <div className="pool-steps">
        {sequence.map((s, k) => (
          <div key={k} className="pool-step">
            <span className="inline-dot" style={{ background: s.hex }} />
            <select value={s.hex.toLowerCase()} onChange={(e) => setStep(k, { hex: e.target.value })} aria-label="Farve">
              {!palette.some((p) => p.hex.toLowerCase() === s.hex.toLowerCase()) && (
                <option value={s.hex.toLowerCase()}>{colorName(project, s.hex)}</option>
              )}
              {palette.map((p) => (
                <option key={p.hex} value={p.hex.toLowerCase()}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="input num pool-count"
              type="number"
              min={1}
              max={99}
              value={s.count}
              onChange={(e) => setStep(k, { count: Math.max(1, Math.min(99, Number(e.target.value) | 0)) })}
              aria-label="Antal masker"
            />
            <span className="pool-unit">m</span>
            <button
              className="icon-btn subtle small"
              onClick={() => set({ sequence: sequence.filter((_, j) => j !== k) })}
              title="Fjern"
              aria-label="Fjern farven fra forløbet"
            >
              <Trash width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn ghost small" onClick={addStep}>
        <Plus width={16} height={16} /> Tilføj farve
      </button>
      <div className="pool-options">
        <label className="field">
          Strikkes
          <select value={direction} onChange={(e) => set({ direction: e.target.value })}>
            <option value="flat">Frem og tilbage</option>
            <option value="round">Rundt</option>
          </select>
        </label>
        <label className="field">
          Start
          <input
            className="input num"
            type="number"
            min={0}
            max={Math.max(0, length - 1)}
            value={offset}
            onChange={(e) => set({ offset: Math.max(0, Number(e.target.value) | 0) })}
            title="Hvor mange masker inde i forløbet den første maske starter"
          />
        </label>
      </div>
      <p className="muted pool-info">
        Forløbet er <b>{length}</b> masker · bredeste række <b>{widest}</b> masker.
        {advice && <> {advice}</>}
      </p>
      <button className="btn primary small" onClick={onApply} disabled={!length || !widest}>
        {updating ? 'Opdater laget' : 'Generér som nyt lag'}
      </button>
    </details>
  )
}
