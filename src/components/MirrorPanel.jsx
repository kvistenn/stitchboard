import { FlipH, FlipV, RotateCw, RotateCcw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from './Icons'

const SIDES = [
  { id: 'left', icon: ChevronLeft, label: 'til venstre' },
  { id: 'right', icon: ChevronRight, label: 'til højre' },
  { id: 'up', icon: ChevronUp, label: 'opad' },
  { id: 'down', icon: ChevronDown, label: 'nedad' },
]

/**
 * Spejlvend eller rotér det valgte (target beskriver hvad, fx "markeringen") på stedet – eller læg en spejlvendt
 * kopi lige ved siden af. onFlip('h'|'v'), onRotate('cw'|'ccw'), onCopy('left'|'right'|'up'|'down').
 * Uden target er knapperne slået fra.
 */
export default function MirrorPanel({ target, onFlip, onRotate, onCopy }) {
  const off = !target
  return (
    <div className="mirror">
      <div className="eyebrow">Spejlvend og rotér</div>
      <p className="muted mirror-target">{target ? `Gælder ${target}.` : 'Markér noget først.'}</p>
      <div className="btn-row">
        <button className="btn ghost small" disabled={off} onClick={() => onFlip('h')} title="Spejlvend venstre ↔ højre">
          <FlipH width={16} height={16} /> Vandret
        </button>
        <button className="btn ghost small" disabled={off} onClick={() => onFlip('v')} title="Spejlvend op ↔ ned">
          <FlipV width={16} height={16} /> Lodret
        </button>
      </div>
      <div className="btn-row">
        <button className="btn ghost small" disabled={off} onClick={() => onRotate('ccw')} title="Rotér 90° mod uret">
          <RotateCcw width={16} height={16} /> Mod uret
        </button>
        <button className="btn ghost small" disabled={off} onClick={() => onRotate('cw')} title="Rotér 90° med uret">
          <RotateCw width={16} height={16} /> Med uret
        </button>
      </div>
      <div className="mirror-copy">
        <span>Spejlet kopi</span>
        {SIDES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className="icon-btn small"
            disabled={off}
            onClick={() => onCopy(id)}
            title={`Læg en spejlvendt kopi ${label}`}
            aria-label={`Spejlet kopi ${label}`}
          >
            <Icon width={16} height={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
