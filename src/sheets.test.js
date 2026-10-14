import { describe, expect, it } from 'vitest'
import { normalizeColor, parseSheetHTML } from './sheets'
import { newProject, pasteSheet } from './state'

// sådan ser udklipsholderen ud når man kopierer celler i Google Sheets
const SHEETS = `<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1"><colgroup><col width="21"/><col width="21"/><col width="21"/></colgroup><tbody><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#ff0000;"></td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;"></td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#FFFFFF;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Start&quot;}">Start &amp; slut</td></tr><tr style="height:21px;"><td style="overflow:hidden;background-color:rgb(0, 0, 255);" colspan="2" rowspan="2">Ærme<br/>højre</td><td style="background-color:#ff0000;"></td></tr><tr><td>12</td></tr></tbody></table></google-sheets-html-origin>`

describe('normalizeColor', () => {
  it('læser hex og rgb', () => {
    expect(normalizeColor('#F00')).toBe('#ff0000')
    expect(normalizeColor('#00FF00')).toBe('#00ff00')
    expect(normalizeColor('rgb(0, 0, 255)')).toBe('#0000ff')
    expect(normalizeColor('rgba(0,0,0,0)')).toBe(null)
    expect(normalizeColor('transparent')).toBe(null)
  })
})

describe('parseSheetHTML', () => {
  it('returnerer null uden en tabel', () => {
    expect(parseSheetHTML('<p>hej</p>')).toBe(null)
    expect(parseSheetHTML('')).toBe(null)
  })

  it('læser farver, tekst og flettede celler fra Google Sheets', () => {
    const s = parseSheetHTML(SHEETS)
    expect(s.w).toBe(3)
    expect(s.h).toBe(3)
    const at = (r, c) => s.cells.find((x) => x.r === r && x.c === c)
    expect(at(0, 0)).toEqual({ r: 0, c: 0, color: '#ff0000', text: '' })
    expect(at(0, 1)).toBeUndefined()
    // hvid tæller som ingen farve, men teksten bliver
    expect(at(0, 2)).toEqual({ r: 0, c: 2, color: null, text: 'Start & slut' })
    // flettet celle: farven i alle fire felter, teksten kun øverst til venstre
    expect(at(1, 0)).toEqual({ r: 1, c: 0, color: '#0000ff', text: 'Ærme\nhøjre' })
    expect(at(1, 1).color).toBe('#0000ff')
    expect(at(2, 0).color).toBe('#0000ff')
    expect(at(2, 1).text).toBe('')
    expect(at(1, 2).color).toBe('#ff0000')
    // cellen i række 3 springer de flettede felter over
    expect(at(2, 2)).toEqual({ r: 2, c: 2, color: null, text: '12' })
  })

  it('læser farver fra klasser som i Excel', () => {
    const html = `<style>.xl65 { background:#00B050; mso-pattern:black none; }</style><table><tr><td class="xl65"> </td><td>x</td></tr></table>`
    expect(parseSheetHTML(html).cells).toEqual([
      { r: 0, c: 0, color: '#00b050', text: '' },
      { r: 0, c: 1, color: null, text: 'x' },
    ])
  })
})

describe('pasteSheet', () => {
  const sheet = parseSheetHTML(SHEETS)

  it('maler farverne, opretter nye farver i paletten og laver noter', () => {
    const p = newProject('x', 10, 10)
    const { project: next, sel } = pasteSheet(p, sheet, 2, 3, 0)
    const col = (r, c) => next.layers[0].colors[r * 10 + c]
    expect(col(2, 3)).toBe('#ff0000')
    expect(col(3, 3)).toBe('#0000ff')
    expect(col(4, 4)).toBe('#0000ff')
    expect(col(2, 4)).toBe(null)
    expect(next.colors[3 * 10 + 3]).toBe('#0000ff')
    expect(sel).toEqual({ r0: 2, c0: 3, r1: 4, c1: 5 })
    const added = next.palette.slice(p.palette.length)
    expect(added).toEqual([
      { hex: '#ff0000', name: 'Farve 1' },
      { hex: '#0000ff', name: 'Farve 2' },
    ])
    expect(next.recent.slice(0, 2)).toEqual(['#ff0000', '#0000ff'])
    expect(next.notes.map(({ r, c, text }) => ({ r, c, text }))).toEqual([
      { r: 2, c: 5, text: 'Start & slut' },
      { r: 3, c: 3, text: 'Ærme\nhøjre' },
      { r: 4, c: 5, text: '12' },
    ])
  })

  it('genbruger farver der findes i paletten og erstatter en note i samme felt', () => {
    const p = newProject('x', 10, 10)
    p.palette.push({ hex: '#ff0000', name: 'Rød garn' })
    p.notes = [{ id: 'a', r: 0, c: 2, text: 'gammel' }, { id: 'b', r: 9, c: 9, text: 'bliver' }]
    const { project: next } = pasteSheet(p, sheet, 0, 0, 0)
    expect(next.palette.filter((x) => x.hex === '#ff0000')).toHaveLength(1)
    expect(next.notes.find((n) => n.r === 0 && n.c === 2).text).toBe('Start & slut')
    expect(next.notes.some((n) => n.id === 'b')).toBe(true)
    expect(next.notes).toHaveLength(4)
  })

  it('gør lærredet større når mønsteret ikke kan være der', () => {
    const p = newProject('x', 2, 2)
    const { project: next, sel } = pasteSheet(p, sheet, 1, 1, 0)
    expect(next.cols).toBe(4)
    expect(next.rows).toBe(4)
    expect(next.layers[0].colors).toHaveLength(16)
    expect(next.layers[0].colors[1 * 4 + 1]).toBe('#ff0000')
    expect(sel).toEqual({ r0: 1, c0: 1, r1: 3, c1: 3 })
  })
})
