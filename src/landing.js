// Demo-mønster til landingssiden: ét tegn pr. maske, nederste række strikkes først
export const DEMO_COLORS = {
  '.': { fill: '#efe6d6', name: 'hvid' },
  i: { fill: 'var(--brand)', name: 'indigo' },
  p: { fill: 'var(--brand-pastel)', name: 'lilla' },
  r: { fill: '#d0643b', name: 'rust' },
}

export const DEMO_PATTERN = [
  'iiiiiiiiiiiiiii',
  'p.p.p.p.p.p.p.p',
  '...............',
  '.......r.......',
  '......rrr......',
  '..i...r.r...i..',
  '.iii.rr.rr.iii.',
  '..i...r.r...i..',
  '......rrr......',
  '.......r.......',
  '...............',
  'p.p.p.p.p.p.p.p',
  'iiiiiiiiiiiiiii',
]

// "rrr..r" -> [{ key: 'r', count: 3 }, { key: '.', count: 2 }, { key: 'r', count: 1 }]
export function rowRuns(row) {
  const runs = []
  for (const key of row) {
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.count++
    else runs.push({ key, count: 1 })
  }
  return runs
}

export function describeRow(row, colors = DEMO_COLORS) {
  return rowRuns(row)
    .map((run) => `${run.count} ${colors[run.key]?.name ?? run.key}`)
    .join(', ')
}
