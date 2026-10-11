import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave, mergePending } from './autosave'
import { UnauthorizedError } from './api'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  const projects = new Map()
  const save = vi.fn(async () => {})
  const onFailedChange = vi.fn()
  const onUnauthorized = vi.fn()
  const a = createAutosave({ getProject: (id) => projects.get(id), save, onFailedChange, onUnauthorized })
  return { a, projects, save, onFailedChange, onUnauthorized }
}

describe('createAutosave', () => {
  it('samler hurtige ændringer til ét gem med nyeste version', async () => {
    const { a, projects, save } = setup()
    projects.set('a', { id: 'a', v: 1 })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(200)
    projects.set('a', { id: 'a', v: 2 })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(299)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ id: 'a', v: 2 })
    expect(a.hasPending()).toBe(false)
  })

  it('saveNow gemmer uden ventetid', async () => {
    const { a, projects, save } = setup()
    projects.set('a', { id: 'a' })
    await a.saveNow('a')
    expect(save).toHaveBeenCalledWith({ id: 'a' })
  })

  it('melder fejl og prøver igen efter 5 sek.', async () => {
    const { a, projects, save, onFailedChange } = setup()
    save.mockRejectedValueOnce(new Error('net'))
    projects.set('a', { id: 'a' })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(onFailedChange).toHaveBeenLastCalledWith(true)
    expect(a.hasPending()).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(onFailedChange).toHaveBeenLastCalledWith(false)
    expect(a.hasPending()).toBe(false)
  })

  it('bevarer ændringer ved udløbet login og sender dem ved resume', async () => {
    const { a, projects, save, onUnauthorized } = setup()
    save.mockRejectedValueOnce(new UnauthorizedError())
    projects.set('a', { id: 'a' })
    projects.set('b', { id: 'b' })
    a.markDirty('a')
    a.markDirty('b')
    await vi.advanceTimersByTimeAsync(300)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect([...a.pendingIds()].sort()).toEqual(['a', 'b'])
    await a.resume()
    expect(save).toHaveBeenCalledTimes(3)
    expect(a.hasPending()).toBe(false)
  })

  it('gemmer igen hvis projektet ændres mens et gem er undervejs', async () => {
    const { a, projects, save } = setup()
    let release
    save.mockImplementationOnce(() => new Promise((r) => (release = r)))
    projects.set('a', { id: 'a', v: 1 })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)
    projects.set('a', { id: 'a', v: 2 })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)
    release()
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ id: 'a', v: 2 })
  })

  it('forget dropper et ventende gem', async () => {
    const { a, projects, save } = setup()
    projects.set('a', { id: 'a' })
    a.markDirty('a')
    a.forget('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
  })

  it('springer projekter over der ikke findes længere', async () => {
    const { a, save } = setup()
    a.markDirty('borte')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
    expect(a.hasPending()).toBe(false)
  })

  it('flushOnHide sender med keepalive og rydder kun uændrede', async () => {
    const { a, projects, save } = setup()
    const p1 = { id: 'a', v: 1 }
    projects.set('a', p1)
    projects.set('b', { id: 'b' })
    a.markDirty('a')
    a.markDirty('b')
    a.flushOnHide()
    expect(save).toHaveBeenCalledWith(p1, { keepalive: true })
    projects.set('a', { id: 'a', v: 2 })
    await Promise.resolve()
    await Promise.resolve()
    expect([...a.pendingIds()]).toEqual(['a'])
  })
})

describe('mergePending', () => {
  it('lader lokale ventende versioner vinde', () => {
    const remote = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }]
    const local = [{ id: 'a', v: 2 }, { id: 'b', v: 2 }, { id: 'c', v: 2 }]
    const merged = mergePending(remote, local, new Set(['a', 'c']))
    expect(merged).toHaveLength(3)
    expect(merged.find((p) => p.id === 'a').v).toBe(2)
    expect(merged.find((p) => p.id === 'b').v).toBe(1)
    expect(merged.find((p) => p.id === 'c').v).toBe(2)
  })
  it('returnerer serverens liste når intet venter', () => {
    const remote = [{ id: 'a' }]
    expect(mergePending(remote, [{ id: 'x' }], new Set())).toEqual(remote)
  })
})
