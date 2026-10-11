# Database-lagring af skabeloner – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skabeloner gemmes i Netlify Blobs bag en adgangskode i stedet for i browserens localStorage, så de er de samme på alle enheder.

**Architecture:** Én Netlify Function (`netlify/functions/api.mjs`, sti `/api/*`) med ren, testbar logik i `netlify/functions/lib/` (session-cookie + routing mod et injiceret store). Klienten får et fetch-lag (`src/api.js`), en ren autogem-kø (`src/autosave.js`) og en login-skærm; `App.jsx` kobler det sammen.

**Tech Stack:** React 19, Vite 8, Netlify Functions (moderne `(req) => Response`-format), `@netlify/blobs`, Node `crypto`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-database-lagring-design.md`

## Global Constraints

- **Rør ikke brugerens ikke-committede ændringer** i `src/components/Editor.jsx`, `src/components/GridCanvas.jsx`, `src/components/Icons.jsx`, `src/components/KnitPanel.jsx`, `src/state.js`, `src/styles.css`. Stage altid med eksplicitte stier – aldrig `git add -A` / `git add .`. Ny CSS lægges i `src/session.css`, ikke i `styles.css`.
- Miljøvariabler: `STITCHBOARD_PASSWORD`, `SESSION_SECRET`. Mangler en, svarer API'et 500 og logger fejlen.
- Cookie: navn `sb_session`, værdi `<udløb-ms>.<hex HMAC-SHA256(SESSION_SECRET, udløb)>`, flag `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`.
- Blobs-store hedder `projects`, nøgle = projekt-`id`, værdi = projekt-JSON. Gyldige id'er: `/^[A-Za-z0-9_-]{1,64}$/`.
- Kun online: ingen localStorage-cache. Gamle localStorage-data læses ikke og slettes ikke.
- Al UI-tekst er dansk. Commit-beskeder på dansk, afsluttet med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Autogem: 300 ms debounce, genforsøg efter 5000 ms ved fejl.

## Review Focus

1. **Stort projekt (300×300) + fanen lukkes lige efter en ændring** – `keepalive`-fetch afvises over 64 KB; store projekter skal sendes uden `keepalive`, og `beforeunload` advarer når noget mangler at blive gemt. (Test i Task 3.)
2. **Ændring mens et gem er undervejs** – den nye version skal også gemmes bagefter, ikke tabes. (Test i Task 4.)
3. **Login udløber midt i redigering** – ændringerne bevares og sendes efter nyt login, og vinder over serverens ældre version. (Tests i Task 4.)
4. **Mærkelige id'er i URL'en** (`..%2Fx`, mellemrum, for lange) – skal give 400, aldrig skrive en blob. (Test i Task 2.)
5. **Manipuleret eller udløbet cookie** – skal give 401. (Tests i Task 1 og 2.)

---

### Task 1: Værktøj + session-logik

**Files:**
- Modify: `package.json` (afhængigheder + `test`-script)
- Modify: `.gitignore`
- Modify: `netlify.toml`
- Create: `netlify/functions/lib/session.mjs`
- Test: `netlify/functions/lib/session.test.mjs`

**Interfaces:**
- Produces (fra `netlify/functions/lib/session.mjs`):
  - `COOKIE_NAME: 'sb_session'`
  - `SESSION_MAX_AGE_S: 31536000`
  - `checkPassword(expected: string, given: unknown): boolean`
  - `signSession(secret: string, expiresAt: number): string`
  - `verifySession(secret: string, value: string | undefined, now: number): boolean`
  - `readCookie(header: string | null, name: string): string | undefined`
  - `sessionCookie(value: string): string` / `clearedCookie(): string` (Set-Cookie-værdier)

- [ ] **Step 1: Installér afhængigheder**

```bash
npm install @netlify/blobs@^11.1.4
npm install -D vitest@^5.0.3
```

Tilføj i `package.json` under `"scripts"` (efter `"lint"`):

```json
    "test": "vitest run",
```

- [ ] **Step 2: Opdatér `.gitignore` og `netlify.toml`**

Tilføj nederst i `.gitignore`:

```
.env
.netlify
```

Tilføj nederst i `netlify.toml` (så `netlify dev` starter Vite og proxier til den):

```toml
[dev]
  framework = "#custom"
  command = "npm run dev"
  targetPort = 5173
  port = 8888
```

- [ ] **Step 3: Skriv de fejlende tests**

`netlify/functions/lib/session.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import {
  COOKIE_NAME,
  checkPassword,
  signSession,
  verifySession,
  readCookie,
  sessionCookie,
  clearedCookie,
} from './session.mjs'

describe('checkPassword', () => {
  it('godtager korrekt kode', () => {
    expect(checkPassword('hemmelig', 'hemmelig')).toBe(true)
  })
  it('afviser forkert kode, også med anden længde', () => {
    expect(checkPassword('hemmelig', 'hemmeli')).toBe(false)
    expect(checkPassword('hemmelig', 'hemmeligX')).toBe(false)
  })
  it('afviser tom eller manglende kode', () => {
    expect(checkPassword('hemmelig', '')).toBe(false)
    expect(checkPassword('hemmelig', undefined)).toBe(false)
    expect(checkPassword('hemmelig', 123)).toBe(false)
  })
})

describe('session', () => {
  const secret = 's3cret'
  it('godtager egen signatur før udløb', () => {
    expect(verifySession(secret, signSession(secret, 2000), 1000)).toBe(true)
  })
  it('afviser udløbet session', () => {
    expect(verifySession(secret, signSession(secret, 2000), 2000)).toBe(false)
  })
  it('afviser anden hemmelighed', () => {
    expect(verifySession('andet', signSession(secret, 2000), 1000)).toBe(false)
  })
  it('afviser manipuleret udløb', () => {
    const sig = signSession(secret, 2000).split('.')[1]
    expect(verifySession(secret, `999999.${sig}`, 1000)).toBe(false)
  })
  it('afviser skrald', () => {
    for (const v of [undefined, '', 'abc', '.', '2000.', 'x.y', '2000.zz', '-5.ab']) {
      expect(verifySession(secret, v, 1000)).toBe(false)
    }
  })
})

describe('cookies', () => {
  it('læser den navngivne cookie', () => {
    expect(readCookie('a=1; sb_session=abc.def; b=2', 'sb_session')).toBe('abc.def')
  })
  it('giver undefined når den mangler', () => {
    expect(readCookie(null, 'sb_session')).toBeUndefined()
    expect(readCookie('a=1', 'sb_session')).toBeUndefined()
  })
  it('sætter sikre flag', () => {
    const c = sessionCookie('v')
    expect(c.startsWith(`${COOKIE_NAME}=v;`)).toBe(true)
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=31536000']) {
      expect(c).toContain(flag)
    }
  })
  it('rydder cookien', () => {
    expect(clearedCookie()).toContain('Max-Age=0')
  })
})
```

- [ ] **Step 4: Kør testen og se den fejle**

Run: `npx vitest run netlify/functions/lib/session.test.mjs`
Expected: FAIL – `Failed to load url ./session.mjs` / modulet findes ikke.

- [ ] **Step 5: Implementér**

`netlify/functions/lib/session.mjs`:

```js
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE_NAME = 'sb_session'
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60

const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex')
const digest = (s) => createHash('sha256').update(s).digest()

// Sammenligner hashes så tidsforbruget ikke afslører kodens længde eller indhold
export function checkPassword(expected, given) {
  if (typeof given !== 'string' || given === '') return false
  return timingSafeEqual(digest(expected), digest(given))
}

export function signSession(secret, expiresAt) {
  return `${expiresAt}.${hmac(secret, String(expiresAt))}`
}

export function verifySession(secret, value, now) {
  if (typeof value !== 'string') return false
  const dot = value.indexOf('.')
  if (dot < 1) return false
  const exp = value.slice(0, dot)
  if (!/^\d+$/.test(exp) || Number(exp) <= now) return false
  const expected = Buffer.from(hmac(secret, exp))
  const got = Buffer.from(value.slice(dot + 1))
  return got.length === expected.length && timingSafeEqual(got, expected)
}

export function readCookie(header, name) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

const FLAGS = 'HttpOnly; Secure; SameSite=Strict; Path=/'

export const sessionCookie = (value) => `${COOKIE_NAME}=${value}; ${FLAGS}; Max-Age=${SESSION_MAX_AGE_S}`
export const clearedCookie = () => `${COOKIE_NAME}=; ${FLAGS}; Max-Age=0`
```

- [ ] **Step 6: Kør testen og se den bestå**

Run: `npx vitest run netlify/functions/lib/session.test.mjs`
Expected: PASS (alle tests grønne). Kør også `npm run lint` – ingen fejl.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore netlify.toml netlify/functions/lib/session.mjs netlify/functions/lib/session.test.mjs
git commit -m "API: session-cookie og adgangskodetjek + Vitest og Netlify-opsætning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API-handler og Netlify Function

**Files:**
- Create: `netlify/functions/lib/handler.mjs`
- Create: `netlify/functions/api.mjs`
- Test: `netlify/functions/lib/handler.test.mjs`

**Interfaces:**
- Consumes: alt fra `session.mjs` (Task 1).
- Produces:
  - `createHandler({ store, env, now? }): (req: Request) => Promise<Response>` hvor `store = { get(key): Promise<object|null>, set(key, value): Promise<void>, delete(key): Promise<void>, list(): Promise<string[]> }`, `env = { STITCHBOARD_PASSWORD, SESSION_SECRET }`, `now = () => number` (ms, default `Date.now`).
  - `isValidProject(p: unknown): boolean`
  - HTTP-API som i spec'en: `POST /api/login`, `POST /api/logout`, `GET /api/projects`, `PUT /api/projects/:id`, `DELETE /api/projects/:id`.

- [ ] **Step 1: Skriv de fejlende tests**

`netlify/functions/lib/handler.test.mjs`:

```js
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
  it('PUT gemmer og GET returnerer nyeste først', async () => {
    expect((await handle(req('PUT', '/api/projects/a', { body: project('a', { updatedAt: 1 }) }))).status).toBe(204)
    expect((await handle(req('PUT', '/api/projects/b', { body: project('b', { updatedAt: 5 }) }))).status).toBe(204)
    const res = await handle(req('GET', '/api/projects'))
    expect(res.status).toBe(200)
    expect((await res.json()).map((p) => p.id)).toEqual(['b', 'a'])
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
  it('PUT afviser mærkelige id\'er', async () => {
    for (const id of ['..%2Fx', 'a%20b', 'x'.repeat(65)]) {
      const body = project(decodeURIComponent(id))
      expect((await handle(req('PUT', `/api/projects/${id}`, { body }))).status).toBe(400)
    }
    expect(store.map.size).toBe(0)
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
    expect((await handle(req('GET', '/api/projects/a'))).status).toBe(404)
  })
})
```

- [ ] **Step 2: Kør testen og se den fejle**

Run: `npx vitest run netlify/functions/lib/handler.test.mjs`
Expected: FAIL – `./handler.mjs` findes ikke.

- [ ] **Step 3: Implementér handleren**

`netlify/functions/lib/handler.mjs`:

```js
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_S,
  checkPassword,
  signSession,
  verifySession,
  readCookie,
  sessionCookie,
  clearedCookie,
} from './session.mjs'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isValidProject(p) {
  return (
    !!p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    typeof p.id === 'string' &&
    Number.isFinite(p.cols) &&
    Number.isFinite(p.rows) &&
    Array.isArray(p.shape)
  )
}

const empty = (status, headers) => new Response(null, { status, headers })
const readJSON = (req) => req.json().catch(() => null)

export function createHandler({ store, env, now = Date.now }) {
  return async function handle(req) {
    const { STITCHBOARD_PASSWORD: password, SESSION_SECRET: secret } = env
    if (!password || !secret) {
      console.error('Stitchboard: STITCHBOARD_PASSWORD og SESSION_SECRET skal være sat')
      return empty(500)
    }

    const path = new URL(req.url).pathname.replace(/\/+$/, '')
    const method = req.method

    if (path === '/api/login' && method === 'POST') {
      const body = await readJSON(req)
      if (!checkPassword(password, body?.password)) return empty(401)
      const value = signSession(secret, now() + SESSION_MAX_AGE_S * 1000)
      return empty(204, { 'Set-Cookie': sessionCookie(value) })
    }

    if (!verifySession(secret, readCookie(req.headers.get('cookie'), COOKIE_NAME), now())) return empty(401)

    if (path === '/api/logout' && method === 'POST') {
      return empty(204, { 'Set-Cookie': clearedCookie() })
    }

    if (path === '/api/projects' && method === 'GET') {
      const keys = await store.list()
      const projects = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean)
      projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      return Response.json(projects)
    }

    const m = path.match(/^\/api\/projects\/([^/]+)$/)
    if (m && (method === 'PUT' || method === 'DELETE')) {
      const id = decodeURIComponent(m[1])
      if (!ID_RE.test(id)) return empty(400)
      if (method === 'DELETE') {
        await store.delete(id)
        return empty(204)
      }
      const body = await readJSON(req)
      if (!isValidProject(body) || body.id !== id) return empty(400)
      await store.set(id, body)
      return empty(204)
    }

    return empty(404)
  }
}
```

- [ ] **Step 4: Kør testen og se den bestå**

Run: `npx vitest run netlify/functions/lib/handler.test.mjs`
Expected: PASS.

- [ ] **Step 5: Tilslut Netlify Blobs**

`netlify/functions/api.mjs`:

```js
import { getStore } from '@netlify/blobs'
import { createHandler } from './lib/handler.mjs'

export default async function api(req) {
  const blobs = getStore({ name: 'projects', consistency: 'strong' })
  const handle = createHandler({
    env: process.env,
    store: {
      get: (key) => blobs.get(key, { type: 'json' }),
      set: (key, value) => blobs.setJSON(key, value),
      delete: (key) => blobs.delete(key),
      list: async () => (await blobs.list()).blobs.map((b) => b.key),
    },
  })
  try {
    return await handle(req)
  } catch (e) {
    console.error('Stitchboard API-fejl', e)
    return new Response(null, { status: 500 })
  }
}

export const config = { path: '/api/*' }
```

- [ ] **Step 6: Kør alle tests + lint**

Run: `npm test && npm run lint`
Expected: alle tests PASS, ingen lint-fejl.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/api.mjs netlify/functions/lib/handler.mjs netlify/functions/lib/handler.test.mjs
git commit -m "API: login og CRUD for skabeloner i Netlify Blobs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Klientens API-lag

**Files:**
- Create: `src/api.js`
- Test: `src/api.test.js`

**Interfaces:**
- Consumes: HTTP-API fra Task 2.
- Produces (fra `src/api.js`):
  - `class UnauthorizedError extends Error`
  - `login(password: string): Promise<boolean>` – `true` ved succes, `false` ved forkert kode, kaster ved andre fejl
  - `logout(): Promise<void>`
  - `fetchProjects(): Promise<Project[]>`
  - `saveProject(project, { keepalive?: boolean } = {}): Promise<void>`
  - `deleteProject(id: string): Promise<void>`
  - Alle undtagen `login` kaster `UnauthorizedError` ved 401 og `Error` ved andre ikke-OK svar.

- [ ] **Step 1: Skriv de fejlende tests**

`src/api.test.js`:

```js
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
```

- [ ] **Step 2: Kør testen og se den fejle**

Run: `npx vitest run src/api.test.js`
Expected: FAIL – `./api` findes ikke.

- [ ] **Step 3: Implementér**

`src/api.js`:

```js
export class UnauthorizedError extends Error {
  constructor() {
    super('Ikke logget ind')
    this.name = 'UnauthorizedError'
  }
}

// Browsere afviser keepalive-requests med en krop over 64 KB
const KEEPALIVE_LIMIT = 60_000

async function request(path, { method = 'GET', body, keepalive = false } = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body)
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: json,
    keepalive: keepalive && json !== undefined && new TextEncoder().encode(json).length < KEEPALIVE_LIMIT,
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`Serverfejl (${res.status})`)
  return res
}

export async function login(password) {
  try {
    await request('/api/login', { method: 'POST', body: { password } })
    return true
  } catch (e) {
    if (e instanceof UnauthorizedError) return false
    throw e
  }
}

export async function logout() {
  await request('/api/logout', { method: 'POST' })
}

export async function fetchProjects() {
  return (await request('/api/projects')).json()
}

export async function saveProject(project, { keepalive = false } = {}) {
  await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: project, keepalive })
}

export async function deleteProject(id) {
  await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
```

- [ ] **Step 4: Kør testen og se den bestå**

Run: `npx vitest run src/api.test.js`
Expected: PASS. Kør også `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/api.js src/api.test.js
git commit -m "Klient: fetch-lag til skabelon-API'et

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Autogem-kø

**Files:**
- Create: `src/autosave.js`
- Test: `src/autosave.test.js`

**Interfaces:**
- Consumes: `UnauthorizedError` fra `src/api.js` (Task 3). `save` har signaturen fra `saveProject`.
- Produces (fra `src/autosave.js`):
  - `createAutosave({ getProject, save, onFailedChange?, onUnauthorized?, delay = 300, retryDelay = 5000 })` → objekt med:
    - `markDirty(id)` – gem efter `delay` ms (debounce)
    - `saveNow(id): Promise<void>` – gem straks
    - `forget(id)` – drop ventende gem (ved sletning)
    - `resume(): Promise<void>` – send alt ventende straks (efter login)
    - `hasPending(): boolean`, `pendingIds(): Set<string>`
    - `flushOnHide()` – send ventende med `keepalive: true` (ved `pagehide`/skjult fane)
    - `dispose()` – stop timer
  - `getProject(id)` returnerer den **nyeste** version eller `undefined` (slettet).
  - `onFailedChange(failed: boolean)` kaldes kun når tilstanden skifter.
  - `mergePending(remote: Project[], local: Project[], ids: Set<string>): Project[]` – serverens liste, men lokale versioner af ventende id'er vinder (og lokale ventende projekter der ikke findes på serveren tilføjes).

- [ ] **Step 1: Skriv de fejlende tests**

`src/autosave.test.js`:

```js
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
```

- [ ] **Step 2: Kør testen og se den fejle**

Run: `npx vitest run src/autosave.test.js`
Expected: FAIL – `./autosave` findes ikke.

- [ ] **Step 3: Implementér**

`src/autosave.js`:

```js
import { UnauthorizedError } from './api'

// Holder styr på hvilke projekter der mangler at blive gemt og sender dem samlet
export function createAutosave({
  getProject,
  save,
  onFailedChange = () => {},
  onUnauthorized = () => {},
  delay = 300,
  retryDelay = 5000,
}) {
  const pending = new Set()
  let timer = null
  let running = false
  let failed = false

  const setFailed = (v) => {
    if (v === failed) return
    failed = v
    onFailedChange(v)
  }
  const schedule = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(run, ms)
  }

  async function run() {
    clearTimeout(timer)
    timer = null
    if (running) return // det igangværende gem planlægger selv en ny runde
    running = true
    let error = false
    try {
      for (const id of [...pending]) {
        const project = getProject(id)
        // fjernes før vi sender, så en ændring undervejs markerer den igen
        pending.delete(id)
        if (!project) continue
        try {
          await save(project)
        } catch (e) {
          pending.add(id)
          if (e instanceof UnauthorizedError) {
            onUnauthorized()
            return
          }
          error = true
        }
      }
    } finally {
      running = false
    }
    setFailed(error)
    if (error) schedule(retryDelay)
    else if (pending.size) schedule(delay)
  }

  return {
    markDirty(id) {
      pending.add(id)
      schedule(delay)
    },
    saveNow(id) {
      pending.add(id)
      return run()
    },
    forget(id) {
      pending.delete(id)
    },
    resume() {
      return pending.size ? run() : Promise.resolve()
    },
    hasPending: () => pending.size > 0,
    pendingIds: () => new Set(pending),
    flushOnHide() {
      for (const id of pending) {
        const project = getProject(id)
        if (!project) continue
        save(project, { keepalive: true }).then(
          () => getProject(id) === project && pending.delete(id),
          () => {},
        )
      }
    },
    dispose() {
      clearTimeout(timer)
    },
  }
}

export function mergePending(remote, local, ids) {
  const byId = new Map(remote.map((p) => [p.id, p]))
  for (const p of local) if (ids.has(p.id)) byId.set(p.id, p)
  return [...byId.values()]
}
```

- [ ] **Step 4: Kør testen og se den bestå**

Run: `npx vitest run src/autosave.test.js`
Expected: PASS. Kør også `npm test && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/autosave.js src/autosave.test.js
git commit -m "Klient: autogem-kø med debounce, genforsøg og login-udløb

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Login-skærm og App-integration

**Files:**
- Create: `src/components/Login.jsx`
- Create: `src/session.css`
- Modify: `src/App.jsx` (erstattes helt)
- Modify: `src/components/Home.jsx` (Log ud-knap, ny prop `onLogout`)
- Modify: `src/storage.js` (localStorage-funktioner fjernes)
- Modify: `README.md`

**Interfaces:**
- Consumes: `login`, `logout`, `fetchProjects`, `saveProject`, `deleteProject`, `UnauthorizedError` (Task 3); `createAutosave`, `mergePending` (Task 4).
- Produces: `<Login onLoggedIn={() => void} />`; `Home` får prop `onLogout: () => void`. `Editor`-props er uændrede (`project`, `onChange`, `onBack`).

- [ ] **Step 1: Ryd localStorage ud af `src/storage.js`**

Slet linje 1–35 (importen fra `./state`, `KEY`, `OLD_KEY`, `migrate`, `loadProjects`, `saveProjects`). Tilbage står kun `downloadJSON` og `readJSONFile`, uændrede. (Kant-migrering af gamle `.strik.json` håndteres allerede i `importProject` i `App.jsx`.)

- [ ] **Step 2: Opret `src/session.css`**

```css
.login-screen,
.center-screen {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-screen {
  background: var(--brand-grad);
}
.login-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 340px;
  background: var(--surface);
  padding: 28px 24px;
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.login-card .hero-badge {
  align-self: center;
  background: var(--brand-soft);
  color: var(--brand);
}
.login-card h1 {
  font-size: 22px;
  margin: 4px 0;
}
.login-error {
  color: #dc2626;
  font-size: 14px;
}
.center-screen {
  flex-direction: column;
  gap: 12px;
  color: var(--muted);
}
.home-actions {
  display: flex;
  gap: 8px;
}
.save-status {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow);
}
```

- [ ] **Step 3: Opret `src/components/Login.jsx`**

```jsx
import { useState } from 'react'
import { Yarn } from './Icons'
import { login } from '../api'

export default function Login({ onLoggedIn }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      if (await login(password)) {
        onLoggedIn()
        return
      }
      setError('Forkert adgangskode')
    } catch {
      setError('Kunne ikke kontakte serveren')
    }
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="hero-badge">
          <Yarn /> Stitchboard
        </div>
        <h1>Log ind</h1>
        <input
          className="input"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          Log ind
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Tilføj Log ud i `src/components/Home.jsx`**

Udvid signaturen:

```jsx
export default function Home({ projects, onOpen, onCreate, onDelete, onDuplicate, onImport, onLogout }) {
```

Erstat Importér-knappen i `.home-row`:

```jsx
          <button className="btn ghost" onClick={() => fileRef.current.click()}>
            <Upload /> Importér fil
          </button>
```

med:

```jsx
          <div className="home-actions">
            <button className="btn ghost" onClick={() => fileRef.current.click()}>
              <Upload /> Importér fil
            </button>
            <button className="btn ghost" onClick={onLogout}>
              Log ud
            </button>
          </div>
```

- [ ] **Step 5: Erstat `src/App.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import Home from './components/Home'
import Editor from './components/Editor'
import Login from './components/Login'
import { newProject, uid, edgesFromShape, shapeFromEdges } from './state'
import { fetchProjects, saveProject, deleteProject, logout, UnauthorizedError } from './api'
import { createAutosave, mergePending } from './autosave'
import './session.css'

export default function App() {
  const [status, setStatus] = useState('loading') // 'loading' | 'login' | 'ready' | 'error'
  const [projects, setProjects] = useState([])
  const [openId, setOpenId] = useState(null)
  const [saveFailed, setSaveFailed] = useState(false)

  // nyeste liste opdateres synkront, så autogem altid sender den nyeste version
  const latest = useRef([])
  const commit = useCallback((next) => {
    latest.current = next
    setProjects(next)
  }, [])

  const autosave = useRef(null)
  if (!autosave.current) {
    autosave.current = createAutosave({
      getProject: (id) => latest.current.find((p) => p.id === id),
      save: saveProject,
      onFailedChange: setSaveFailed,
      onUnauthorized: () => setStatus('login'),
    })
  }

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const remote = await fetchProjects()
      // ændringer der ikke nåede frem før login udløb, vinder over serverens version
      commit(mergePending(remote, latest.current, autosave.current.pendingIds()))
      setStatus('ready')
      autosave.current.resume()
    } catch (e) {
      setStatus(e instanceof UnauthorizedError ? 'login' : 'error')
    }
  }, [commit])

  useEffect(() => {
    load()
  }, [load])

  // send straks hvis fanen lukkes/skjules, og advar hvis noget ikke er nået frem
  useEffect(() => {
    const a = autosave.current
    const onHide = () => a.flushOnHide()
    const onVisibility = () => document.hidden && a.flushOnHide()
    const onBeforeUnload = (e) => {
      if (a.hasPending()) e.preventDefault()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      a.dispose()
    }
  }, [])

  const project = projects.find((p) => p.id === openId) || null

  const updateProject = useCallback(
    (next) => {
      next = { ...next, updatedAt: Date.now() }
      commit(latest.current.map((p) => (p.id === next.id ? next : p)))
      autosave.current.markDirty(next.id)
    },
    [commit],
  )

  const addAndSave = (p) => {
    commit([p, ...latest.current])
    autosave.current.saveNow(p.id)
  }

  const create = (name, cols, rows) => {
    const p = newProject(name, cols, rows)
    addAndSave(p)
    setOpenId(p.id)
  }

  const remove = async (id) => {
    const p = latest.current.find((x) => x.id === id)
    commit(latest.current.filter((x) => x.id !== id))
    autosave.current.forget(id)
    if (openId === id) setOpenId(null)
    try {
      await deleteProject(id)
    } catch (e) {
      // læg den tilbage, så listen ikke lyver om hvad der ligger på serveren
      if (p) {
        commit([p, ...latest.current])
        autosave.current.markDirty(id)
      }
      if (e instanceof UnauthorizedError) setStatus('login')
      else alert(`"${p?.name}" kunne ikke slettes. Prøv igen.`)
    }
  }

  const duplicate = (id) => {
    const src = latest.current.find((p) => p.id === id)
    if (!src) return
    addAndSave({ ...src, id: uid(), name: src.name + ' (kopi)', createdAt: Date.now(), updatedAt: Date.now() })
  }

  const importProject = (data) => {
    if (!data || !Array.isArray(data.shape) || !data.cols || !data.rows) {
      alert('Det ligner ikke en skabelon-fil.')
      return
    }
    const base = newProject(data.name || 'Importeret', data.cols, data.rows)
    const p = { ...base, ...data, id: uid(), knit: { ...base.knit, ...(data.knit || {}) }, updatedAt: Date.now() }
    if (!Array.isArray(p.hEdges) || !Array.isArray(p.vEdges)) {
      Object.assign(p, edgesFromShape(p.cols, p.rows, p.shape))
    }
    p.shape = shapeFromEdges(p.cols, p.rows, p.hEdges, p.vEdges).shape
    addAndSave(p)
    setOpenId(p.id)
  }

  const signOut = async () => {
    const a = autosave.current
    if (a.hasPending() && !confirm('Nogle ændringer er ikke gemt endnu. Log ud alligevel?')) return
    try {
      await logout()
    } catch {
      // vi viser login-skærmen alligevel
    }
    for (const id of a.pendingIds()) a.forget(id)
    commit([])
    setOpenId(null)
    setSaveFailed(false)
    setStatus('login')
  }

  if (status === 'loading') return <div className="center-screen">Henter skabeloner…</div>
  if (status === 'login') return <Login onLoggedIn={load} />
  if (status === 'error') {
    return (
      <div className="center-screen">
        <p>Kunne ikke hente skabeloner.</p>
        <button className="btn primary" onClick={load}>
          Prøv igen
        </button>
      </div>
    )
  }

  return (
    <>
      {saveFailed && <div className="save-status">Ikke gemt – prøver igen</div>}
      {project ? (
        <Editor key={project.id} project={project} onChange={updateProject} onBack={() => setOpenId(null)} />
      ) : (
        <Home
          projects={projects}
          onOpen={setOpenId}
          onCreate={create}
          onDelete={remove}
          onDuplicate={duplicate}
          onImport={importProject}
          onLogout={signOut}
        />
      )}
    </>
  )
}
```

- [ ] **Step 6: Opdatér `README.md`**

Erstat linjen `Projekter gemmes automatisk i browseren (localStorage) og kan eksporteres/importeres som `.strik.json` eller gemmes som PNG.` med:

```markdown
Projekter gemmes automatisk i en database (Netlify Blobs) bag en adgangskode, så de er de samme på alle dine enheder. De kan stadig eksporteres/importeres som `.strik.json` eller gemmes som PNG.
```

Erstat afsnittet `## Kør lokalt` (inkl. kodeblokken) med:

````markdown
## Kør lokalt

Opret en `.env` i roden (den committes ikke):

```
STITCHBOARD_PASSWORD=din-adgangskode
SESSION_SECRET=en-lang-tilfældig-streng
```

```bash
npm install
npx netlify-cli dev   # åbner http://localhost:8888 med API og lokalt lager
npm test
```

`npm run dev` alene starter kun Vite, uden API – så kan du ikke logge ind.
````

Tilføj i `## Deploy på Netlify` som nyt punkt før "Deploy":

```markdown
3. Under **Site configuration → Environment variables**: sæt `STITCHBOARD_PASSWORD` og `SESSION_SECRET` (fx `openssl rand -hex 32`). Skifter du `SESSION_SECRET`, logges alle enheder ud.
```

og omnummerér det nuværende punkt 3 til 4.

- [ ] **Step 7: Kør tests, lint og build**

Run: `npm test && npm run lint && npm run build`
Expected: alle tests PASS, ingen lint-fejl, build lykkes.

- [ ] **Step 8: Manuel verifikation med `netlify dev`**

Opret `.env` lokalt som i README (fx `STITCHBOARD_PASSWORD=test` og en tilfældig `SESSION_SECRET`). Start `npx netlify-cli dev` og tjek:

1. `curl -i http://localhost:8888/api/projects` → `401` (ikke `index.html` – bekræfter at funktionen vinder over SPA-redirecten).
2. Åbn `http://localhost:8888` → login-skærm. Forkert kode → "Forkert adgangskode". Rigtig kode → forsiden (tom liste – gamle localStorage-data vises ikke).
3. Opret en skabelon, tegn lidt, gå tilbage → miniaturen viser ændringen. Genindlæs siden → stadig der, ingen login-skærm.
4. Duplikér og slet → begge holder efter genindlæsning. Importér en `.strik.json` → holder efter genindlæsning.
5. Åbn i et privat vindue → login kræves; efter login ses de samme skabeloner.
6. Mens du redigerer: stop `netlify dev`, tegn → "Ikke gemt – prøver igen" vises; start serveren igen → beskeden forsvinder inden for ~5 sek., og ændringen er der efter genindlæsning.
7. Log ud → login-skærm; genindlæs → stadig login-skærm.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/components/Login.jsx src/components/Home.jsx src/session.css src/storage.js README.md
git commit -m "Skabeloner gemmes i databasen bag login i stedet for localStorage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Kontrollér bagefter med `git status`, at Editor.jsx, GridCanvas.jsx, Icons.jsx, KnitPanel.jsx, state.js og styles.css stadig står som ikke-committede ændringer og ikke er med i nogen commit.
