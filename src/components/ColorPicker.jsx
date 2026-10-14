import { useEffect, useRef, useState } from 'react'
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb } from '../colors'

// HEX, RGB eller HSL huskes i browseren, så vælgeren åbner som sidst
const MODE_KEY = 'stitchboard.colorMode'
const MODES = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'hsl', label: 'HSL' },
]
function readMode() {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return MODES.some((x) => x.id === m) ? m : 'hex'
  } catch {
    return 'hex'
  }
}

/** Talfelt der må stå tomt eller halvt skrevet mens man skriver – værdien sendes kun når den er gyldig */
function NumField({ label, value, max, onChange }) {
  const [draft, setDraft] = useState(null)
  return (
    <label className="cp-field">
      <input
        inputMode="numeric"
        value={draft ?? String(Math.round(value))}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)))
        }}
        onBlur={() => setDraft(null)}
        aria-label={label}
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * Farvevælger: felt for mætning/lysstyrke, skyder for farvetone og felter i HEX, RGB eller HSL.
 * value er en hex-farve; onChange(hex) kaldes ved hver ændring.
 */
export default function ColorPicker({ value, onChange }) {
  const [mode, setModeState] = useState(readMode)
  // hsv holdes selv, så farvetonen ikke springer til 0 når farven er grå/sort
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value) || { r: 0, g: 0, b: 0 }))
  const [hexDraft, setHexDraft] = useState(null)
  const areaRef = useRef(null)

  const current = rgbToHex(hsvToRgb(hsv))
  useEffect(() => {
    // farven er ændret udefra
    if (value && value.toLowerCase() !== current) {
      const rgb = hexToRgb(value)
      const next = rgb && rgbToHsv(rgb)
      if (next) setHsv((old) => (next.s ? next : { ...next, h: old.h }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const setMode = (m) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // privat vindue o.l. – valget huskes bare ikke
    }
  }

  const apply = (next) => {
    setHsv(next)
    onChange(rgbToHex(hsvToRgb(next)))
  }
  const applyRgb = (rgb) => {
    const next = rgbToHsv(rgb)
    apply(next.s ? next : { ...next, h: hsv.h })
  }

  const pickArea = (e) => {
    const b = areaRef.current.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * 100
    const v = (1 - Math.max(0, Math.min(1, (e.clientY - b.top) / b.height))) * 100
    apply({ ...hsv, s, v })
  }

  const rgb = hsvToRgb(hsv)
  const hsl = rgbToHsl(rgb)

  return (
    <div className="color-picker">
      <div
        ref={areaRef}
        className="cp-area"
        style={{ background: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pickArea(e)
        }}
        onPointerMove={(e) => e.buttons && pickArea(e)}
      >
        <div className="cp-thumb" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: current }} />
      </div>
      <input
        className="cp-hue"
        type="range"
        min="0"
        max="359"
        value={Math.round(hsv.h)}
        onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
        aria-label="Farvetone"
      />
      <div className="cp-modes" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={mode === m.id ? 'active' : ''}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="cp-fields">
        {mode === 'hex' && (
          <label className="cp-field wide">
            <input
              value={hexDraft ?? current}
              onChange={(e) => {
                setHexDraft(e.target.value)
                const c = hexToRgb(e.target.value)
                if (c && e.target.value.replace('#', '').length === 6) applyRgb(c)
              }}
              onBlur={() => setHexDraft(null)}
              spellCheck={false}
              aria-label="Hex"
            />
            <span>HEX</span>
          </label>
        )}
        {mode === 'rgb' &&
          ['r', 'g', 'b'].map((k) => (
            <NumField
              key={k}
              label={k.toUpperCase()}
              value={rgb[k]}
              max={255}
              onChange={(n) => applyRgb({ ...rgb, [k]: n })}
            />
          ))}
        {mode === 'hsl' &&
          [
            ['h', 'H', 359],
            ['s', 'S', 100],
            ['l', 'L', 100],
          ].map(([k, label, max]) => (
            <NumField
              key={k}
              label={label}
              value={hsl[k]}
              max={max}
              onChange={(n) => {
                const next = { ...hsl, [k]: n }
                const v = rgbToHsv(hslToRgb(next))
                // farvetonen fra HSL bevares, også når farven er grå
                apply({ ...v, h: next.h })
              }}
            />
          ))}
      </div>
    </div>
  )
}
