// Strikkesymboler der kan sættes på felterne – tegnet som stier i en 24×24-boks (som ikonerne),
// så de kan bruges både som SVG i knapperne og som Path2D på lærredet. fill = udfyldt figur.

export const SYMBOLS = [
  { id: 'knit', name: 'Ret', path: 'M12 4.5v15' },
  { id: 'purl', name: 'Vrang', path: 'M14.8 12a2.8 2.8 0 1 1-5.6 0a2.8 2.8 0 1 1 5.6 0Z', fill: true },
  { id: 'yo', name: 'Slå om', path: 'M18 12a6 6 0 1 1-12 0a6 6 0 1 1 12 0Z' },
  { id: 'k2tog', name: '2 ret sammen', path: 'M6 19L18 5' },
  { id: 'ssk', name: '2 ret sammen drejet', path: 'M6 5l12 14' },
  { id: 'cdd', name: '3 sammen', path: 'M5 19L12 5l7 14' },
  { id: 'm1', name: 'Udtagning', path: 'M12 19.5V12M5.5 4.5 12 12l6.5-7.5' },
  { id: 'sl', name: 'Løs af', path: 'M5.5 5 12 19l6.5-14' },
  { id: 'bobble', name: 'Noppe', path: 'M17.5 12a5.5 5.5 0 1 1-11 0a5.5 5.5 0 1 1 11 0Z', fill: true },
  { id: 'none', name: 'Ingen maske', path: 'M6 6l12 12M18 6 6 18' },
]

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]))

export function symbolById(id) {
  return (id && BY_ID.get(id)) || null
}

export function symbolName(id) {
  return symbolById(id)?.name || ''
}

// når et mønster spejlvendes vandret, hælder indtagningerne den anden vej
const FLIP_H = { k2tog: 'ssk', ssk: 'k2tog' }

export function flipSymbol(id, axis) {
  return (axis === 'h' && FLIP_H[id]) || id
}
