import { Copy, Trash } from './Icons'

/**
 * Liste over skabelonerne i skabelon-tilstand, ligesom laglisten. Klik vælger skabelonen på lærredet,
 * kopi-knappen duplikerer den og skraldespanden sletter den (Ctrl+Z fortryder).
 */
export default function TemplatesPanel({ templates, active, onSelect, onDuplicate, onRemove }) {
  if (!templates.length) return null
  return (
    <div className="layers">
      <div className="eyebrow">Skabeloner</div>
      <ul className="layer-list">
        {templates.map((t) => (
          <li
            key={t.key}
            className={'layer-row' + (active && t.key === active.key ? ' active' : '')}
            onClick={() => onSelect(t)}
          >
            <span className="layer-name">{t.name}</span>
            <span className="tpl-size">
              {t.c1 - t.c0 + 1} × {t.r1 - t.r0 + 1}
            </span>
            <button
              className="icon-btn small"
              onClick={(e) => (e.stopPropagation(), onDuplicate(t))}
              title="Dupliker skabelon"
              aria-label={`Dupliker ${t.name}`}
            >
              <Copy width={16} height={16} />
            </button>
            <button
              className="icon-btn small"
              onClick={(e) => (e.stopPropagation(), onRemove(t))}
              title="Slet skabelon"
              aria-label={`Slet ${t.name}`}
            >
              <Trash width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
