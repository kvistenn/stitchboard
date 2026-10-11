import { describe, expect, it } from 'vitest'
import { cropToTemplate, edgesFromShape, floodFill, moveCells, newProject, shapeFromEdges } from './state'

// 6x2 lærred: skabelonen er de tre højre felter i begge rækker, resten er udenfor
function project() {
  const p = newProject('Test', 6, 2)
  const want = [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]
  const edges = edgesFromShape(6, 2, want)
  return { ...p, ...edges, shape: shapeFromEdges(6, 2, edges.hEdges, edges.vEdges).shape }
}

describe('moveCells', () => {
  it('flytter et mønster tegnet udenfor skabelonen ind på den', () => {
    const p = project()
    const colors = p.colors.slice()
    colors[0] = '#e11d48' // (0,0) udenfor
    colors[7] = '#2563eb' // (1,1) udenfor
    const next = moveCells({ ...p, colors }, { r0: 0, c0: 0, r1: 1, c1: 1 }, 0, 3)
    expect(next[0]).toBe(null)
    expect(next[7]).toBe(null)
    expect(next[3]).toBe('#e11d48')
    expect(next[10]).toBe('#2563eb')
  })
})

describe('floodFill', () => {
  it('fylder udenfor skabelonen uden at løbe ind i den', () => {
    const next = floodFill(project(), 0, 0, '#16a34a')
    expect(next.colors.slice(0, 6)).toEqual(['#16a34a', '#16a34a', '#16a34a', null, null, null])
  })

  it('fylder indenfor skabelonen uden at løbe ud', () => {
    const next = floodFill(project(), 0, 4, '#16a34a')
    expect(next.colors.slice(0, 6)).toEqual([null, null, null, '#16a34a', '#16a34a', '#16a34a'])
  })
})

describe('cropToTemplate', () => {
  it('sletter mønster udenfor skabelonen og beholder det indenfor', () => {
    const p = project()
    const colors = p.colors.slice()
    colors[1] = '#e11d48' // udenfor
    colors[4] = '#2563eb' // indenfor
    const next = cropToTemplate({ ...p, colors })
    expect(next.colors[1]).toBe(null)
    expect(next.colors[4]).toBe('#2563eb')
  })
})
