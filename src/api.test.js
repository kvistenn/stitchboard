import { describe, it, expect, vi, afterEach } from 'vitest'
import { login, fetchProjects, saveProject, deleteProject, UnauthorizedError } from './api'

const respond = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status })

function stubFetch(...responses) {
  const f = vi.fn()
  for (const r of responses) f.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('login', () => {
  it('giver true ved succes', async () => {
    const f = stubFetch(respond(204))
    expect(await login('garn')).toBe(true)
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/api/login')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ password: 'garn' })
  })
  it('giver false ved forkert kode', async () => {
    stubFetch(respond(401))
    expect(await login('nej')).toBe(false)
  })
  it('kaster ved serverfejl', async () => {
    stubFetch(respond(500))
    await expect(login('garn')).rejects.toThrow()
  })
})

describe('fetchProjects', () => {
  it('returnerer listen', async () => {
    stubFetch(respond(200, [{ id: 'a' }]))
    expect(await fetchProjects()).toEqual([{ id: 'a' }])
  })
  it('kaster UnauthorizedError ved 401', async () => {
    stubFetch(respond(401))
    await expect(fetchProjects()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe('saveProject', () => {
  it('sender PUT med projektet', async () => {
    const f = stubFetch(respond(204))
    await saveProject({ id: 'abc', name: 'Sokker' })
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/api/projects/abc')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ id: 'abc', name: 'Sokker' })
    expect(opts.keepalive).toBe(false)
  })
  it('bruger keepalive for små projekter', async () => {
    const f = stubFetch(respond(204))
    await saveProject({ id: 'a' }, { keepalive: true })
    expect(f.mock.calls[0][1].keepalive).toBe(true)
  })
  it('dropper keepalive for projekter over 64 KB', async () => {
    const f = stubFetch(respond(204))
    const big = { id: 'a', colors: new Array(300 * 300).fill('#2563eb') }
    await saveProject(big, { keepalive: true })
    expect(f.mock.calls[0][1].keepalive).toBe(false)
  })
  it('kaster ved serverfejl', async () => {
    stubFetch(respond(500))
    await expect(saveProject({ id: 'a' })).rejects.toThrow()
  })
})

describe('deleteProject', () => {
  it('sender DELETE', async () => {
    const f = stubFetch(respond(204))
    await deleteProject('abc')
    expect(f.mock.calls[0][0]).toBe('/api/projects/abc')
    expect(f.mock.calls[0][1].method).toBe('DELETE')
  })
})
