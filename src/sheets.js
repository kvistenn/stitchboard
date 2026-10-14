// Indsæt fra Google Sheets (og Excel): udklipsholderen har en HTML-tabel, hvor hver celle er ét felt.
// Cellens baggrundsfarve bliver feltets farve, og tekst i cellen bliver en note i feltet.
// Parseren er lavet med regulære udtryk i stedet for DOMParser, så den også kan testes uden en browser.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return n === 160 ? ' ' : String.fromCodePoint(n)
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Cellens tekst: <br> bliver linjeskift, resten af HTML'en fjernes */
function cellText(html) {
  const text = html
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .join('\n')
    .trim()
}

/** En CSS-farve som #rrggbb (små bogstaver), eller null hvis den ikke kan læses/er gennemsigtig */
export function normalizeColor(value) {
  if (!value) return null
  const v = value.trim().toLowerCase()
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) return '#' + [...m[1]].map((x) => x + x).join('')
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/)
  if (m) return m[2] === '00' ? null : '#' + m[1]
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null
    return '#' + [m[1], m[2], m[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('')
  }
  return null
}

/** Baggrundsfarven i en style-tekst (background-color eller background) */
function backgroundOf(style) {
  if (!style) return undefined
  const m = style.match(/(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/i)
  if (!m) return undefined
  // "background: #ff0000 none" – tag den første del der er en farve
  const parts = m[1].match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)
  return parts ? normalizeColor(parts[0]) : null
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4]) : undefined
}

/** Klasse-regler fra <style> (Excel lægger farverne i klasser som .xl65) */
function classColors(html) {
  const map = new Map()
  for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const color = backgroundOf(body)
      if (color === undefined) continue
      for (const sel of selectors.split(',')) {
        const m = sel.trim().match(/\.([\w-]+)$/)
        if (m) map.set(m[1], color)
      }
    }
  }
  return map
}

/**
 * Læser den første tabel i HTML'en. Returnerer { w, h, cells } hvor cells er de felter der har
 * en farve eller tekst: { r, c, color, text }. Hvid tæller som ingen farve. null hvis der ikke er en tabel.
 * Flettede celler (colspan/rowspan) farver alle felterne; teksten kommer i det øverste venstre.
 */
export function parseSheetHTML(html) {
  if (!html) return null
  const table = html.match(/<table\b[\s\S]*?<\/table>/i)
  if (!table) return null
  const classes = classColors(html)
  const taken = [] // taken[r] = Set af kolonner der er dækket af en flettet celle ovenfra
  const cells = []
  let w = 0
  let r = 0
  for (const [, row] of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    let c = 0
    for (const [, , attrs, inner] of row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      while (taken[r]?.has(c)) c++
      const colspan = Math.max(1, parseInt(attr(attrs, 'colspan')) || 1)
      const rowspan = Math.max(1, parseInt(attr(attrs, 'rowspan')) || 1)
      let color = backgroundOf(attr(attrs, 'style'))
      if (color === undefined) {
        const cls = (attr(attrs, 'class') || '').split(/\s+/).find((k) => classes.has(k))
        color = cls ? classes.get(cls) : normalizeColor(attr(attrs, 'bgcolor'))
      }
      if (color === '#ffffff') color = null
      const text = cellText(inner)
      for (let dr = 0; dr < rowspan; dr++)
        for (let dc = 0; dc < colspan; dc++) {
          if (dr) (taken[r + dr] ||= new Set()).add(c + dc)
          const first = !dr && !dc
          if (color || (first && text)) cells.push({ r: r + dr, c: c + dc, color: color || null, text: first ? text : '' })
        }
      c += colspan
      w = Math.max(w, c)
    }
    r++
  }
  const h = Math.max(r, taken.length)
  if (!w || !h) return null
  return { w, h, cells }
}
