import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHandler } from './handler.mjs'
import { signSession, COOKIE_NAME } from './session.mjs'

const env = { STITCHBOARD_PASSWORD: 'garn', SESSION_SECRET: 'hemmelighed' }
const NOW = 1_000_000

function memoryStore() {
  const map = new Map()
  return {
    map,
    get: async (k) => (map.has(k) ? structuredClone(map.get(k)) : null),
    set: async (k, v) => void map.set(k, structuredClone(v)),
    delete: async (k) => void map.delete(k),
    list: async () => [...map.keys()],
  }
}

const authCookie = `${COOKIE_NAME}=${signSession(env.SESSION_SECRET, NOW + 60_000)}`

function req(method, path, { body, cookie = authCookie } = {}) {
  const headers = {}
  if (cookie) headers.cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const project = (id, extra = {}) => ({ id, name: 'Sokker', cols: 2, rows: 2, shape: [1, 1, 1, 1], updatedAt: 1, ...extra })

let store
let handle
beforeEach(() => {
  store = memoryStore()
  handle = createHandler({ store, env, now: () => NOW })
})

describe('login', () => {
  it('sætter en brugbar cookie ved korrekt kode', async () => {
    const res = await handle(req('POST', '/api/login', { body: { password: 'garn' }, cookie: null }))
    expect(res.status).toBe(204)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain(`${COOKIE_NAME}=`)
    const cookie = setCookie.split(';')[0]
    expect((await handle(req('GET', '/api/projects', { cookie }))).status).toBe(200)
  })
  it('afviser forkert kode uden cookie', async () => {
    const res = await handle(req('POST', '/api/login', { body: { password: 'nej' }, cookie: null }))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
  it('afviser ugyldig JSON', async () => {
    const res = await handle(req('POST', '/api/login', { body: '{ikke json', cookie: null }))
    expect(res.status).toBe(401)
  })
})

describe('adgang', () => {
  it('kræver cookie', async () => {
    expect((await handle(req('GET', '/api/projects', { cookie: null }))).status).toBe(401)
  })
  it('afviser udløbet cookie', async () => {
    const cookie = `${COOKIE_NAME}=${signSession(env.SESSION_SECRET, NOW)}`
    expect((await handle(req('GET', '/api/projects', { cookie }))).status).toBe(401)
  })
  it('afviser cookie signeret med anden hemmelighed', async () => {
    const cookie = `${COOKIE_NAME}=${signSession('forkert', NOW + 60_000)}`
    expect((await handle(req('GET', '/api/projects', { cookie }))).status).toBe(401)
  })
  it('svarer 500 når miljøvariabler mangler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = createHandler({ store, env: {}, now: () => NOW })
    expect((await h(req('GET', '/api/projects'))).status).toBe(500)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('logout rydder cookien', async () => {
    const res = await handle(req('POST', '/api/logout'))
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('projekter', () => {
  it("GET-listen giver kun id'er, så svaret forbliver lille", async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    await handle(req('PUT', '/api/projects/b', { body: project('b') }))
    const res = await handle(req('GET', '/api/projects'))
    expect(res.status).toBe(200)
    expect((await res.json()).sort()).toEqual(['a', 'b'])
  })
  it('GET henter ét projekt, og null når det ikke findes', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Hue' }) }))
    const res = await handle(req('GET', '/api/projects/a'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(project('a', { name: 'Hue' }))
    // ikke 404: Netlify prøver så `<sti>.html` i stedet, og klienten får 400
    const missing = await handle(req('GET', '/api/projects/findes-ikke'))
    expect(missing.status).toBe(200)
    expect(await missing.json()).toBeNull()
    expect((await handle(req('GET', '/api/projects/..%2Fx'))).status).toBe(400)
  })
  it('GET tåler skråstreg til sidst', async () => {
    expect((await handle(req('GET', '/api/projects/'))).status).toBe(200)
  })
  it('PUT overskriver eksisterende', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Gammel' }) }))
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Ny' }) }))
    expect(store.map.get('a').name).toBe('Ny')
  })
  it('PUT afviser id der ikke matcher stien', async () => {
    expect((await handle(req('PUT', '/api/projects/a', { body: project('b') }))).status).toBe(400)
    expect(store.map.size).toBe(0)
  })
  it('PUT afviser ugyldige projekter', async () => {
    for (const body of ['{ikke json', [], { id: 'a' }, project('a', { cols: '2' }), project('a', { shape: null })]) {
      expect((await handle(req('PUT', '/api/projects/a', { body }))).status).toBe(400)
    }
    expect(store.map.size).toBe(0)
  })
  it("PUT afviser mærkelige id'er", async () => {
    for (const id of ['..%2Fx', 'a%20b', 'x'.repeat(65)]) {
      const body = project(decodeURIComponent(id))
      expect((await handle(req('PUT', `/api/projects/${id}`, { body }))).status).toBe(400)
    }
    expect(store.map.size).toBe(0)
  })
  it('PUT og DELETE afviser ugyldig URL-kodning', async () => {
    expect((await handle(req('PUT', '/api/projects/%E0', { body: project('a') }))).status).toBe(400)
    expect((await handle(req('DELETE', '/api/projects/%E0'))).status).toBe(400)
  })
  it('DELETE fjerner, også hvis den ikke fandtes', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    expect((await handle(req('DELETE', '/api/projects/a'))).status).toBe(204)
    expect(store.map.has('a')).toBe(false)
    expect((await handle(req('DELETE', '/api/projects/findes-ikke'))).status).toBe(204)
  })
  it('ukendte ruter og metoder giver 404', async () => {
    expect((await handle(req('GET', '/api/andet'))).status).toBe(404)
    expect((await handle(req('POST', '/api/projects', { body: project('a') }))).status).toBe(404)
    expect((await handle(req('POST', '/api/projects/a', { body: project('a') }))).status).toBe(404)
  })
})
