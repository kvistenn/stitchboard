import { describe, expect, it } from 'vitest'
import { DEMO_COLORS, DEMO_PATTERN, describeRow, rowRuns } from './landing'

describe('rowRuns', () => {
  it('samler ens masker i træk', () => {
    expect(rowRuns('rrr..r')).toEqual([
      { key: 'r', count: 3 },
      { key: '.', count: 2 },
      { key: 'r', count: 1 },
    ])
  })

  it('giver en tom liste for en tom række', () => {
    expect(rowRuns('')).toEqual([])
  })
})

describe('describeRow', () => {
  it('skriver farveskift som i strikke-trinnet', () => {
    expect(describeRow('..iii.')).toBe('2 hvid, 3 indigo, 1 hvid')
  })

  it('falder tilbage til tegnet ved ukendt farve', () => {
    expect(describeRow('xx')).toBe('2 x')
  })
})

describe('DEMO_PATTERN', () => {
  it('har lige lange rækker med kendte farver', () => {
    const width = DEMO_PATTERN[0].length
    for (const row of DEMO_PATTERN) {
      expect(row).toHaveLength(width)
      for (const key of row) expect(DEMO_COLORS[key]).toBeDefined()
    }
  })
})
