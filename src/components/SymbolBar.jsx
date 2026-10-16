import { SYMBOLS, symbolById } from '../symbols'

/** Et strikkesymbol som ikon (samme stier som på lærredet) */
export function SymbolIcon({ id, size = 20, ...p }) {
  const sym = symbolById(id)
  if (!sym) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={sym.fill ? 'currentColor' : 'none'}
      stroke={sym.fill ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d={sym.path} />
    </svg>
  )
}

/**
 * Flydende bjælke med strikkesymbolerne (Symbol-værktøjet i mønster-tilstand) – i stedet for farvebjælken.
 *  value – id på det valgte symbol, onSelect(id)
 */
export default function SymbolBar({ value, onSelect }) {
  return (
    <div className="colorbar-wrap">
      <div className="colorbar symbolbar">
        {SYMBOLS.map((s) => (
          <button
            key={s.id}
            className={'symbol-btn' + (s.id === value ? ' active' : '')}
            onClick={() => onSelect(s.id)}
            title={s.name}
            aria-label={s.name}
            aria-pressed={s.id === value}
          >
            <SymbolIcon id={s.id} size={22} />
          </button>
        ))}
        <div className="colorbar-label">{symbolById(value)?.name || 'Vælg et symbol'}</div>
      </div>
    </div>
  )
}
