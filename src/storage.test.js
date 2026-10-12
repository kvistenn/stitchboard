import { describe, it, expect } from 'vitest'
import { readLocalProjects, markLocalImported, normalizeImport } from './storage'

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

const old = (name) => ({ id: 'x' + name, name, cols: 2, rows: 1, shape: [1, 1], colors: [null, '#e11d48'] })

describe('readLocalProjects', () => {
  it('læser skabeloner gemt under det nuværende navn', () => {
    const s = fakeStorage({ 'stitchboard.projects.v1': JSON.stringify([old('a')]) })
    expect(readLocalProjects(s).map((p) => p.name)).toEqual(['a'])
  })
  it('læser skabeloner gemt under det gamle navn', () => {
    const s = fakeStorage({ 'strikkeskabelon.projects.v1': JSON.stringify([old('b')]) })
    expect(readLocalProjects(s).map((p) => p.name)).toEqual(['b'])
  })
  it('giver tom liste når der intet er, eller data er ødelagte', () => {
    expect(readLocalProjects(fakeStorage())).toEqual([])
    expect(readLocalProjects(fakeStorage({ 'stitchboard.projects.v1': '{ødelagt' }))).toEqual([])
    expect(readLocalProjects(undefined)).toEqual([])
  })
  it('giver tom liste når de allerede er hentet, uden at slette dem', () => {
    const s = fakeStorage({ 'stitchboard.projects.v1': JSON.stringify([old('a')]) })
    markLocalImported(s)
    expect(readLocalProjects(s)).toEqual([])
    expect(s.map.has('stitchboard.projects.v1')).toBe(true)
  })
})

describe('normalizeImport', () => {
  it('laver en gammel fil uden lag om til ét lag med farverne', () => {
    const p = normalizeImport({ name: 'Gammel', cols: 2, rows: 1, shape: [1, 1], colors: [null, '#e11d48'] })
    expect(p.layers).toHaveLength(1)
    expect(p.layers[0].colors).toEqual([null, '#e11d48'])
    expect(p.colors).toEqual([null, '#e11d48'])
  })

  it('bevarer lagene i en ny fil', () => {
    const layers = [
      { id: 'a', name: 'Bund', visible: true, colors: ['#2563eb', null] },
      { id: 'b', name: 'Figur', visible: false, colors: [null, '#e11d48'] },
    ]
    const p = normalizeImport({ name: 'Ny', cols: 2, rows: 1, shape: [1, 1], colors: ['#2563eb', null], layers })
    expect(p.layers.map((l) => l.name)).toEqual(['Bund', 'Figur'])
    expect(p.colors).toEqual(['#2563eb', null])
  })

  it('giver nyt id og udleder kanter for gamle filer uden kanter', () => {
    const p = normalizeImport(old('a'))
    expect(p.id).not.toBe('xa')
    expect(p.name).toBe('a')
    expect(Array.isArray(p.hEdges)).toBe(true)
    expect(Array.isArray(p.vEdges)).toBe(true)
    expect(p.colors).toEqual([null, '#e11d48'])
    expect(p.knit).toBeTruthy()
  })
  it('afviser noget der ikke ligner en skabelon', () => {
    expect(normalizeImport(null)).toBeNull()
    expect(normalizeImport({ name: 'x' })).toBeNull()
    expect(normalizeImport({ cols: 2, rows: 1, shape: 'nej' })).toBeNull()
  })
})
