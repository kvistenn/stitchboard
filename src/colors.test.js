import { describe, expect, it } from 'vitest'
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb, extractPalette } from './colors'

describe('farveomregninger', () => {
  it('hex ↔ rgb', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 })
    expect(hexToRgb('f80')).toEqual({ r: 255, g: 136, b: 0 })
    expect(hexToRgb('nope')).toBe(null)
    expect(rgbToHex({ r: 255, g: 136, b: 0 })).toBe('#ff8800')
  })

  it('rgb ↔ hsl og hsv går rundt uden at ændre farven', () => {
    for (const hex of ['#ff8800', '#2563eb', '#16a34a', '#7f7f7f', '#000000', '#ffffff']) {
      const rgb = hexToRgb(hex)
      expect(rgbToHex(hslToRgb(rgbToHsl(rgb)))).toBe(hex)
      expect(rgbToHex(hsvToRgb(rgbToHsv(rgb)))).toBe(hex)
    }
    expect(rgbToHsl(hexToRgb('#ff0000'))).toEqual({ h: 0, s: 100, l: 50 })
  })
})

describe('extractPalette', () => {
  const pixels = (list) => new Uint8ClampedArray(list.flatMap(([r, g, b, a = 255]) => [r, g, b, a]))

  it('finder billedets farver, de mest brugte først', () => {
    const px = [...Array(30).fill([255, 0, 0]), ...Array(10).fill([0, 0, 255]), [0, 255, 0, 0]]
    expect(extractPalette(pixels(px), 2)).toEqual(['#ff0000', '#0000ff'])
  })

  it('springer gennemsigtige pixels over', () => {
    expect(extractPalette(pixels([[1, 2, 3, 0]]), 4)).toEqual([])
  })
})
