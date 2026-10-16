// Farveomregninger til farvevælgeren og farver hentet fra et billede

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** '#abc' eller '#aabbcc' (med eller uden #) → {r,g,b}; null hvis det ikke er en farve */
export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (x) => x + x)
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  const x = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${x(r)}${x(g)}${x(b)}`
}

/** h 0-360, s/l 0-100 */
export function rgbToHsl({ r, g, b }) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  return { h: hueOf(r, g, b, max, d), s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }) {
  s = clamp(s, 0, 100) / 100
  l = clamp(l, 0, 100) / 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 }
}

/** h 0-360, s/v 0-100 – farvevælgerens felt og skyder */
export function rgbToHsv({ r, g, b }) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  return { h: d ? hueOf(r, g, b, max, d) : 0, s: max ? (d / max) * 100 : 0, v: max * 100 }
}

export function hsvToRgb({ h, s, v }) {
  s = clamp(s, 0, 100) / 100
  v = clamp(v, 0, 100) / 100
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 }
}

function hueOf(r, g, b, max, d) {
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/**
 * De vigtigste farver i et billede (median cut, delt ved gennemsnittet). pixels er RGBA som fra getImageData.
 * Næsten gennemsigtige pixels tælles ikke med. Returnerer højst `count` hex-farver, de mest brugte først.
 */
export function extractPalette(pixels, count = 8) {
  const px = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    px.push([pixels[i], pixels[i + 1], pixels[i + 2]])
  }
  if (!px.length) return []
  let boxes = [px]
  while (boxes.length < count) {
    // del kassen med størst spredning (vægtet med antal pixels) langs dens længste akse
    let best = -1
    let bestScore = 0
    let bestAxis = 0
    boxes.forEach((box, k) => {
      if (box.length < 2) return
      for (let a = 0; a < 3; a++) {
        let lo = 255
        let hi = 0
        for (const p of box) {
          if (p[a] < lo) lo = p[a]
          if (p[a] > hi) hi = p[a]
        }
        const score = (hi - lo) * Math.sqrt(box.length)
        if (score > bestScore) {
          bestScore = score
          best = k
          bestAxis = a
        }
      }
    })
    if (best < 0) break
    // del ved gennemsnittet (ikke midterste pixel), så to klart forskellige farver ikke blandes sammen
    const box = boxes[best]
    let mean = 0
    for (const p of box) mean += p[bestAxis]
    mean /= box.length
    boxes.splice(best, 1, box.filter((p) => p[bestAxis] < mean), box.filter((p) => p[bestAxis] >= mean))
  }
  const colors = boxes.map((box) => {
    const sum = [0, 0, 0]
    for (const p of box) for (let a = 0; a < 3; a++) sum[a] += p[a]
    return { hex: rgbToHex({ r: sum[0] / box.length, g: sum[1] / box.length, b: sum[2] / box.length }), n: box.length }
  })
  // samme farve fra to kasser lægges sammen
  const merged = new Map()
  for (const c of colors) merged.set(c.hex, (merged.get(c.hex) || 0) + c.n)
  return [...merged].sort((a, b) => b[1] - a[1]).map(([hex]) => hex)
}

/**
 * Gennemsnitsfarven i hver blok af k×k pixels – pixels er RGBA for et billede på (w·k)×(h·k).
 * Er mindst halvdelen af blokken gennemsigtig, bliver feltet tomt (null). Returnerer w×h felter {r,g,b}|null.
 */
export function averageBlocks(pixels, w, h, k) {
  const out = new Array(w * h)
  const stride = w * k
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let n = 0
      for (let y = r * k; y < (r + 1) * k; y++)
        for (let x = c * k; x < (c + 1) * k; x++) {
          const i = (y * stride + x) * 4
          if (pixels[i + 3] < 128) continue
          sr += pixels[i]
          sg += pixels[i + 1]
          sb += pixels[i + 2]
          n++
        }
      out[r * w + c] = n * 2 >= k * k ? { r: sr / n, g: sg / n, b: sb / n } : null
    }
  return out
}

const dist2 = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2

/**
 * Giver hvert felt den nærmeste af højst `count` farver. Uden palette findes farverne i felterne selv
 * (extractPalette); med palette (hex-liste) bruges kun dem. Returnerer felternes hex (null bevares).
 */
export function quantizeCells(cells, count, palette = null) {
  let hexes = palette
  if (!hexes) {
    const px = []
    for (const cell of cells) if (cell) px.push(cell.r, cell.g, cell.b, 255)
    hexes = extractPalette(px, count)
  }
  const options = hexes.map((hex) => ({ hex: hex.toLowerCase(), rgb: hexToRgb(hex) })).filter((o) => o.rgb)
  if (!options.length) return cells.map(() => null)
  return cells.map((cell) => {
    if (!cell) return null
    let best = options[0]
    for (const o of options) if (dist2(cell, o.rgb) < dist2(cell, best.rgb)) best = o
    return best.hex
  })
}

/** Relativ luminans (WCAG) 0-1; ukendte farver regnes som hvide */
export function luminance(hex) {
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 }
  const lin = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Mørk eller hvid – den der står tydeligst på baggrundsfarven (tekst og symboler på felterne) */
export function contrastColor(hex) {
  const l = luminance(hex)
  // kontrasten mod hvid (1.05/(l+0.05)) og mod mørk (#0f172a ≈ 0.0089) er lige store ved l ≈ 0.18
  return (1.05 / (l + 0.05) >= (l + 0.05) / 0.0589) ? '#ffffff' : '#0f172a'
}

/** Farven gjort mørkere (amount < 0) eller lysere (amount > 0), -1..1 */
export function shade(hex, amount) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const t = amount < 0 ? 0 : 255
  const a = Math.abs(amount)
  return rgbToHex({ r: rgb.r + (t - rgb.r) * a, g: rgb.g + (t - rgb.g) * a, b: rgb.b + (t - rgb.b) * a })
}
