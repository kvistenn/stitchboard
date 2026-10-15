import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHandler } from './handler.mjs'
import { signSession, COOKIE_NAME } from './session.mjs'
import { hashPassword } from './password.mjs'

const env = { SESSION_SECRET: 'hemmelighed', INVITE_CODE: 'invitation' }
const NOW = 1_000_000

function memoryStore() {
  const map = new Map()
  return {
    map,
    get: async (k) => (map.has(k) ? structuredClone(map.get(k)) : null),
    set: async (k, v) => void map.set(k, structuredClone(v)),
    create: async (k, v) => {
      if (map.has(k)) return false
      map.set(k, structuredClone(v))
      return true
    },
    delete: async (k) => void map.delete(k),
    list: async (prefix = '') => [...map.keys()].filter((k) => k.startsWith(prefix)),
  }
}

const cookieFor = (user) => `${COOKIE_NAME}=${signSession(env.SESSION_SECRET, user, NOW + 60_000)}`
const jensCookie = cookieFor('jens')

function req(method, path, { body, cookie = jensCookie } = {}) {
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
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0]

let users
let projects
let handle
const make = (e = env) => createHandler({ users, projects, env: e, now: () => NOW })

beforeEach(async () => {
  users = memoryStore()
  projects = memoryStore()
  handle = make()
  users.map.set('jens', { username: 'Jens', ...(await hashPassword('strikkepind')), createdAt: 1 })
})

const register = (body) => handle(req('POST', '/api/register', { body, cookie: null }))
const login = (body) => handle(req('POST', '/api/login', { body, cookie: null }))

describe('register', () => {
  const ok = { username: 'Anna', password: 'hæklenål1', inviteCode: 'invitation' }

  it('opretter brugeren og logger ind', async () => {
    const res = await register(ok)
    expect(res.status).toBe(204)
    const stored = users.map.get('anna')
    expect(stored.username).toBe('Anna')
    expect(stored.createdAt).toBe(NOW)
    expect(stored).not.toHaveProperty('password')
    const me = await handle(req('GET', '/api/me', { cookie: cookieOf(res) }))
    expect(await me.json()).toEqual({ username: 'Anna' })
  })
  it('afviser forkert eller manglende invitationskode', async () => {
    expect((await register({ ...ok, inviteCode: 'gæt' })).status).toBe(403)
    expect((await register({ ...ok, inviteCode: undefined })).status).toBe(403)
    expect((await register('{ikke json')).status).toBe(403)
    expect(users.map.has('anna')).toBe(false)
  })
  it('tjekker invitationskoden før brugernavnet, så navne ikke kan undersøges', async () => {
    expect((await register({ ...ok, username: 'jens', inviteCode: 'gæt' })).status).toBe(403)
  })
  it('afviser ugyldigt brugernavn og adgangskode', async () => {
    expect((await register({ ...ok, username: 'a.b' })).status).toBe(400)
    expect((await register({ ...ok, password: 'kort' })).status).toBe(400)
    expect((await register({ ...ok, password: 'x'.repeat(201) })).status).toBe(400)
  })
  it('afviser optaget brugernavn, også med andre store/små bogstaver', async () => {
    const res = await register({ ...ok, username: 'JENS' })
    expect(res.status).toBe(409)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(users.map.get('jens').username).toBe('Jens')
  })
})

describe('login', () => {
  it('sætter en brugbar cookie ved korrekt kode, uanset store/små bogstaver i navnet', async () => {
    const res = await login({ username: 'JENS', password: 'strikkepind' })
    expect(res.status).toBe(204)
    expect((await handle(req('GET', '/api/me', { cookie: cookieOf(res) }))).status).toBe(200)
  })
  it('afviser forkert kode, ukendt bruger og skrald ens', async () => {
    for (const body of [
      { username: 'jens', password: 'forkertkode' },
      { username: 'ukendt', password: 'strikkepind' },
      { username: 'a.b', password: 'strikkepind' },
      { username: 'jens' },
      '{ikke json',
    ]) {
      const res = await login(body)
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })
})

describe('adgang', () => {
  it('kræver cookie', async () => {
    expect((await handle(req('GET', '/api/projects', { cookie: null }))).status).toBe(401)
  })
  it('afviser udløbet cookie', async () => {
    const cookie = `${COOKIE_NAME}=${signSession(env.SESSION_SECRET, 'jens', NOW)}`
    expect((await handle(req('GET', '/api/projects', { cookie }))).status).toBe(401)
  })
  it('afviser cookie signeret med anden hemmelighed', async () => {
    const cookie = `${COOKIE_NAME}=${signSession('forkert', 'jens', NOW + 60_000)}`
    expect((await handle(req('GET', '/api/projects', { cookie }))).status).toBe(401)
  })
  it('afviser cookien fra før brugerkonti', async () => {
    const old = signSession(env.SESSION_SECRET, 'jens', NOW + 60_000).split('.').slice(1).join('.')
    expect((await handle(req('GET', '/api/projects', { cookie: `${COOKIE_NAME}=${old}` }))).status).toBe(401)
  })
  it('svarer 500 når miljøvariabler mangler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const e of [{}, { SESSION_SECRET: 'x' }, { INVITE_CODE: 'x' }]) {
      expect((await make(e)(req('GET', '/api/projects'))).status).toBe(500)
    }
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('logout rydder cookien', async () => {
    const res = await handle(req('POST', '/api/logout'))
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('/api/me', () => {
  it('giver det viste brugernavn', async () => {
    const res = await handle(req('GET', '/api/me'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ username: 'Jens' })
  })
  it('giver 401 og rydder cookien hvis brugeren er slettet', async () => {
    users.map.delete('jens')
    const res = await handle(req('GET', '/api/me'))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('projekter', () => {
  it("GET-listen giver kun egne id'er uden præfiks", async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    await handle(req('PUT', '/api/projects/b', { body: project('b') }))
    projects.map.set('anna/c', project('c'))
    const res = await handle(req('GET', '/api/projects'))
    expect(res.status).toBe(200)
    expect((await res.json()).sort()).toEqual(['a', 'b'])
  })
  it('gemmer under brugerens præfiks', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    expect([...projects.map.keys()]).toEqual(['jens/a'])
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
  })
  it("afviser id'er der prøver at ramme et andet præfiks", async () => {
    for (const id of ['..%2Fx', 'anna%2Fc']) {
      expect((await handle(req('GET', `/api/projects/${id}`))).status).toBe(400)
      expect((await handle(req('DELETE', `/api/projects/${id}`))).status).toBe(400)
    }
  })
  it('GET tåler skråstreg til sidst', async () => {
    expect((await handle(req('GET', '/api/projects/'))).status).toBe(200)
  })
  it('PUT overskriver eksisterende', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Gammel' }) }))
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Ny' }) }))
    expect(projects.map.get('jens/a').name).toBe('Ny')
  })
  it('PUT afviser id der ikke matcher stien', async () => {
    expect((await handle(req('PUT', '/api/projects/a', { body: project('b') }))).status).toBe(400)
    expect(projects.map.size).toBe(0)
  })
  it('PUT afviser ugyldige projekter', async () => {
    for (const body of ['{ikke json', [], { id: 'a' }, project('a', { cols: '2' }), project('a', { shape: null })]) {
      expect((await handle(req('PUT', '/api/projects/a', { body }))).status).toBe(400)
    }
    expect(projects.map.size).toBe(0)
  })
  it("PUT afviser mærkelige id'er", async () => {
    for (const id of ['..%2Fx', 'a%20b', 'x'.repeat(65)]) {
      const body = project(decodeURIComponent(id))
      expect((await handle(req('PUT', `/api/projects/${id}`, { body }))).status).toBe(400)
    }
    expect(projects.map.size).toBe(0)
  })
  it('PUT og DELETE afviser ugyldig URL-kodning', async () => {
    expect((await handle(req('PUT', '/api/projects/%E0', { body: project('a') }))).status).toBe(400)
    expect((await handle(req('DELETE', '/api/projects/%E0'))).status).toBe(400)
  })
  it('DELETE fjerner, også hvis den ikke fandtes', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    expect((await handle(req('DELETE', '/api/projects/a'))).status).toBe(204)
    expect(projects.map.has('jens/a')).toBe(false)
    expect((await handle(req('DELETE', '/api/projects/findes-ikke'))).status).toBe(204)
  })
  it('ukendte ruter og metoder giver 404', async () => {
    expect((await handle(req('GET', '/api/andet'))).status).toBe(404)
    expect((await handle(req('POST', '/api/projects', { body: project('a') }))).status).toBe(404)
    expect((await handle(req('POST', '/api/projects/a', { body: project('a') }))).status).toBe(404)
  })
})

describe('isolation mellem brugere', () => {
  it('Anna kan hverken se, hente, overskrive eller slette Jens’ skabeloner', async () => {
    users.map.set('anna', { username: 'Anna', ...(await hashPassword('hæklenål1')), createdAt: 1 })
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Jens' }) }))
    const anna = cookieFor('anna')
    expect(await (await handle(req('GET', '/api/projects', { cookie: anna }))).json()).toEqual([])
    expect(await (await handle(req('GET', '/api/projects/a', { cookie: anna }))).json()).toBeNull()
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Anna' }), cookie: anna }))
    await handle(req('DELETE', '/api/projects/a', { cookie: anna }))
    expect(projects.map.get('jens/a').name).toBe('Jens')
  })
})

describe('migrering af ejerløse skabeloner', () => {
  const withOwner = () => make({ ...env, OWNER_USERNAME: 'Jens' })

  it('flytter nøgler uden præfiks til ejeren ved login', async () => {
    projects.map.set('a', project('a'))
    projects.map.set('b', project('b'))
    projects.map.set('anna/c', project('c'))
    const res = await withOwner()(req('POST', '/api/login', { body: { username: 'jens', password: 'strikkepind' }, cookie: null }))
    expect(res.status).toBe(204)
    expect([...projects.map.keys()].sort()).toEqual(['anna/c', 'jens/a', 'jens/b'])
  })
  it('flytter også ved tilmelding, hvis ejeren ikke har en konto endnu', async () => {
    users.map.delete('jens')
    projects.map.set('a', project('a'))
    const body = { username: 'Jens', password: 'strikkepind', inviteCode: 'invitation' }
    await withOwner()(req('POST', '/api/register', { body, cookie: null }))
    expect([...projects.map.keys()]).toEqual(['jens/a'])
  })
  it('flytter intet for andre brugere eller uden OWNER_USERNAME', async () => {
    projects.map.set('a', project('a'))
    users.map.set('anna', { username: 'Anna', ...(await hashPassword('hæklenål1')), createdAt: 1 })
    await withOwner()(req('POST', '/api/login', { body: { username: 'anna', password: 'hæklenål1' }, cookie: null }))
    await login({ username: 'jens', password: 'strikkepind' })
    expect([...projects.map.keys()]).toEqual(['a'])
  })
  it('overskriver ikke en nyere version efter en afbrudt migrering', async () => {
    projects.map.set('a', project('a', { name: 'Gammel' }))
    projects.map.set('jens/a', project('a', { name: 'Ny' }))
    await withOwner()(req('POST', '/api/login', { body: { username: 'jens', password: 'strikkepind' }, cookie: null }))
    expect(projects.map.get('jens/a').name).toBe('Ny')
    expect(projects.map.has('a')).toBe(false)
  })
})

describe('rettelser fra review', () => {
  it('en slettet bruger mister adgangen på alle ruter', async () => {
    await handle(req('PUT', '/api/projects/a', { body: project('a') }))
    users.map.delete('jens')
    for (const [m, path] of [['GET', '/api/projects'], ['GET', '/api/projects/a'], ['DELETE', '/api/projects/a']]) {
      expect((await handle(req(m, path))).status).toBe(401)
    }
    expect((await handle(req('PUT', '/api/projects/a', { body: project('a') }))).status).toBe(401)
    expect(projects.map.has('jens/a')).toBe(true)
  })
  it('en fejl under migrering spærrer ikke ejeren ude', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    projects.map.set('ødelagt', project('ødelagt'))
    projects.map.set('b', project('b'))
    const get = projects.get
    projects.get = async (k) => {
      if (k === 'ødelagt') throw new Error('ugyldig JSON')
      return get(k)
    }
    const h = make({ ...env, OWNER_USERNAME: 'jens' })
    const res = await h(req('POST', '/api/login', { body: { username: 'jens', password: 'strikkepind' }, cookie: null }))
    expect(res.status).toBe(204)
    expect(projects.map.has('jens/b')).toBe(true)
    expect(projects.map.has('ødelagt')).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
