# Brugerkonti – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstat den fælles adgangskode med personlige konti (brugernavn + adgangskode, tilmelding med invitationskode), hvor hver bruger kun ser sine egne skabeloner.

**Architecture:** Netlify Function `/api/*` får en ny Blobs-store `users` og præfikser skabelon-nøgler med brugeren (`<bruger>/<id>`). Session-cookien signerer brugernavn + udløb. Ren logik ligger i `netlify/functions/lib/` med injicerede stores, så alt testes med in-memory stores. Klienten får en opret-fane på login-skærmen og kasserer ventende ændringer ved brugerskift.

**Tech Stack:** React 19, Vite, Netlify Functions + `@netlify/blobs` 11, `node:crypto` (scrypt, HMAC), vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-brugerkonti-design.md`

## Global Constraints

- Ingen nye afhængigheder; package-filer røres ikke.
- Brugernavn: `^[A-Za-z0-9_-]{3,32}$`, nøgle = små bogstaver.
- Adgangskode: 8–200 tegn.
- Hash: `scrypt(password, salt, 64)`, 16 bytes tilfældigt salt (hex), sammenlign med `timingSafeEqual`.
- Cookie: `sb_session=<bruger>.<udløb>.<hmac>`, `hmac = HMAC-SHA256(SESSION_SECRET, "<bruger>.<udløb>")`, flag `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`.
- Miljøvariabler: `SESSION_SECRET`, `INVITE_CODE` påkrævet; `OWNER_USERNAME` valgfri; `STITCHBOARD_PASSWORD` fjernes.
- Statuskoder: register 204/400/403/409, login 204/401, `/api/me` 200 `{ username }`.
- Alle tekster i UI på dansk. Kodekommentarer på dansk, korte, som i resten af koden.
- **Git:** commit kun når Jens har godkendt det (hans globale regel). Commit-trinnene nedenfor udføres kun efter godkendelse.

## Review Focus

1. **Brugernavn med andre store/små bogstaver** (`Jens` vs `jens`) – skal være samme konto ved login og give 409 ved tilmelding. → test i Task 3.
2. **Gammel cookie fra før deploy** (`<udløb>.<hmac>`) – skal give 401, ikke crashe eller blive tolket som en bruger. → test i Task 2 og 3.
3. **Login som anden bruger i samme browser efter udløbet session** – ventende ændringer må ikke sendes til den nye konto, heller ikke via retry-timer eller `flushOnHide` mens login-skærmen vises. → test i Task 6.
4. **Afbrudt migrering** (gammel nøgle blev ikke slettet) – næste login må ikke overskrive en nyere version under `<owner>/<id>`. → test i Task 4.
5. **Projekt-id der forsøger at ramme et andet præfiks** (`b%2Fx`, `..%2Fx`) – skal give 400. → test i Task 3.

---

## Filer

| Fil | Ansvar |
| --- | --- |
| `netlify/functions/lib/password.mjs` (ny) | validering af brugernavn/adgangskode, `userKey`, scrypt-hash og verifikation |
| `netlify/functions/lib/password.test.mjs` (ny) | tests |
| `netlify/functions/lib/session.mjs` | cookie med bruger; `checkPassword` → `safeEqual` (bruges til invitationskode) |
| `netlify/functions/lib/handler.mjs` | ruter register/login/logout/me, præfiksede projekter, migrering |
| `netlify/functions/lib/handler.test.mjs` | omskrives til ny store-form |
| `netlify/functions/api.mjs` | kobler to Blobs-stores på |
| `scripts/reset-password.mjs` (ny) | udskriver `netlify blobs:set`-kommando |
| `src/api.js` / `src/api.test.js` | `login(username, password)`, `register`, `fetchMe` |
| `src/signup.js` / `src/signup.test.js` (ny) | klientvalidering af opret-formularen |
| `src/autosave.js` / `src/autosave.test.js` | pause efter 401, `clear()` |
| `src/components/Login.jsx`, `src/session.css` | faner Log ind / Opret konto |
| `src/App.jsx`, `src/components/Home.jsx` | brugernavn, brugerskift |
| `README.md` | miljøvariabler, invitation, nulstilling |

---

### Task 1: Adgangskode-hashing og validering

**Files:**
- Create: `netlify/functions/lib/password.mjs`
- Test: `netlify/functions/lib/password.test.mjs`

**Interfaces:**
- Produces: `isValidUsername(u: unknown): boolean`, `isValidPassword(p: unknown): boolean`, `userKey(u: string): string`, `hashPassword(password: string, salt?: string): Promise<{ salt: string, hash: string }>`, `verifyPassword(password: string, stored: { salt: string, hash: string }): Promise<boolean>`

- [ ] **Step 1: Skriv de fejlende tests**

```js
// netlify/functions/lib/password.test.mjs
import { describe, it, expect } from 'vitest'
import { isValidUsername, isValidPassword, userKey, hashPassword, verifyPassword } from './password.mjs'

describe('isValidUsername', () => {
  it('godtager bogstaver, tal, _ og - på 3–32 tegn', () => {
    for (const u of ['Jens', 'abc', 'a_b-c9', 'x'.repeat(32)]) expect(isValidUsername(u)).toBe(true)
  })
  it('afviser for kort, for langt, punktum, skråstreg, mellemrum og ikke-strenge', () => {
    for (const u of ['ab', 'x'.repeat(33), 'a.b', 'a/b', 'a b', 'æøå', '', undefined, 123]) {
      expect(isValidUsername(u)).toBe(false)
    }
  })
})

describe('isValidPassword', () => {
  it('kræver 8–200 tegn', () => {
    expect(isValidPassword('12345678')).toBe(true)
    expect(isValidPassword('x'.repeat(200))).toBe(true)
    expect(isValidPassword('1234567')).toBe(false)
    expect(isValidPassword('x'.repeat(201))).toBe(false)
    expect(isValidPassword(undefined)).toBe(false)
  })
})

describe('userKey', () => {
  it('ser bort fra store/små bogstaver', () => {
    expect(userKey('JeNs')).toBe('jens')
  })
})

describe('hashPassword / verifyPassword', () => {
  it('godtager korrekt kode og afviser forkert', async () => {
    const stored = await hashPassword('strikkepind')
    expect(await verifyPassword('strikkepind', stored)).toBe(true)
    expect(await verifyPassword('strikkepinD', stored)).toBe(false)
  })
  it('bruger nyt salt hver gang', async () => {
    const a = await hashPassword('strikkepind')
    const b = await hashPassword('strikkepind')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(a.hash).toMatch(/^[0-9a-f]{128}$/)
  })
  it('afviser beskadiget gemt hash uden at kaste', async () => {
    expect(await verifyPassword('strikkepind', { salt: 'ab', hash: 'abcd' })).toBe(false)
  })
})
```

- [ ] **Step 2: Kør og se dem fejle**

Run: `npx vitest run netlify/functions/lib/password.test.mjs`
Expected: FAIL – `Failed to resolve import "./password.mjs"`

- [ ] **Step 3: Implementér**

```js
// netlify/functions/lib/password.mjs
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64

const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/

export const isValidUsername = (u) => typeof u === 'string' && USERNAME_RE.test(u)
// øvre grænse, så ingen kan få scrypt til at tygge på megabyte-store koder
export const isValidPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200
export const userKey = (u) => u.toLowerCase()

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = (await scryptAsync(password, salt, KEY_LEN)).toString('hex')
  return { salt, hash }
}

export async function verifyPassword(password, stored) {
  const { hash } = await hashPassword(password, stored.salt)
  const got = Buffer.from(hash, 'hex')
  const expected = Buffer.from(stored.hash, 'hex')
  return got.length === expected.length && timingSafeEqual(got, expected)
}
```

- [ ] **Step 4: Kør tests**

Run: `npx vitest run netlify/functions/lib/password.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit (kun efter godkendelse)**

```bash
git add netlify/functions/lib/password.mjs netlify/functions/lib/password.test.mjs
git commit -m "Add password hashing and username validation"
```

---

### Task 2: Session-cookie med brugernavn

**Files:**
- Modify: `netlify/functions/lib/session.mjs`
- Test: `netlify/functions/lib/session.test.mjs`

**Interfaces:**
- Produces: `safeEqual(expected: string, given: unknown): boolean` (omdøbt fra `checkPassword`, samme adfærd), `signSession(secret: string, user: string, expiresAt: number): string`, `verifySession(secret: string, value: unknown, now: number): string | null` (returnerer brugernøglen). `COOKIE_NAME`, `SESSION_MAX_AGE_S`, `readCookie`, `sessionCookie`, `clearedCookie` uændrede.

- [ ] **Step 1: Opdatér tests**

Erstat `describe('checkPassword', …)` og `describe('session', …)` i `session.test.mjs` og ret importen (`checkPassword` → `safeEqual`):

```js
describe('safeEqual', () => {
  it('godtager ens strenge', () => {
    expect(safeEqual('hemmelig', 'hemmelig')).toBe(true)
  })
  it('afviser forskellige, også med anden længde', () => {
    expect(safeEqual('hemmelig', 'hemmeli')).toBe(false)
    expect(safeEqual('hemmelig', 'hemmeligX')).toBe(false)
  })
  it('afviser tom eller manglende værdi', () => {
    expect(safeEqual('hemmelig', '')).toBe(false)
    expect(safeEqual('hemmelig', undefined)).toBe(false)
    expect(safeEqual('hemmelig', 123)).toBe(false)
  })
})

describe('session', () => {
  const secret = 's3cret'
  it('giver brugeren tilbage før udløb', () => {
    expect(verifySession(secret, signSession(secret, 'jens', 2000), 1000)).toBe('jens')
  })
  it('afviser udløbet session', () => {
    expect(verifySession(secret, signSession(secret, 'jens', 2000), 2000)).toBeNull()
  })
  it('afviser anden hemmelighed', () => {
    expect(verifySession('andet', signSession(secret, 'jens', 2000), 1000)).toBeNull()
  })
  it('afviser manipuleret bruger eller udløb', () => {
    const sig = signSession(secret, 'jens', 2000).split('.')[2]
    expect(verifySession(secret, `anna.2000.${sig}`, 1000)).toBeNull()
    expect(verifySession(secret, `jens.999999.${sig}`, 1000)).toBeNull()
  })
  it('afviser cookien fra før brugerkonti', () => {
    // gammelt format: <udløb>.<hmac af udløb>
    expect(verifySession(secret, signSession(secret, 'jens', 2000).split('.').slice(1).join('.'), 1000)).toBeNull()
  })
  it('afviser skrald', () => {
    for (const v of [undefined, '', 'abc', '.', '..', 'jens.2000.', 'jens..ab', '.2000.ab', 'jens.x.ab', 'jens.-5.ab', 'a.b.2000.ab']) {
      expect(verifySession(secret, v, 1000)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Kør og se dem fejle**

Run: `npx vitest run netlify/functions/lib/session.test.mjs`
Expected: FAIL – `safeEqual is not a function` / forkerte returværdier

- [ ] **Step 3: Implementér**

I `session.mjs` erstat `checkPassword`, `signSession` og `verifySession`:

```js
// Sammenligner hashes så tidsforbruget ikke afslører længde eller indhold
export function safeEqual(expected, given) {
  if (typeof given !== 'string' || given === '') return false
  return timingSafeEqual(digest(expected), digest(given))
}

// brugernavne kan ikke indeholde punktum, så formatet er entydigt
export function signSession(secret, user, expiresAt) {
  const data = `${user}.${expiresAt}`
  return `${data}.${hmac(secret, data)}`
}

// giver brugernøglen ved gyldig session, ellers null
export function verifySession(secret, value, now) {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [user, exp, sig] = parts
  if (!user || !/^\d+$/.test(exp) || Number(exp) <= now) return null
  const expected = Buffer.from(hmac(secret, `${user}.${exp}`))
  const got = Buffer.from(sig)
  return got.length === expected.length && timingSafeEqual(got, expected) ? user : null
}
```

- [ ] **Step 4: Kør tests**

Run: `npx vitest run netlify/functions/lib/session.test.mjs`
Expected: PASS (handler-tests fejler nu – rettes i Task 3)

- [ ] **Step 5: Commit (kun efter godkendelse)** – committes sammen med Task 3, da handleren ikke virker imellem.

---

### Task 3: Ruter for konti og præfiksede skabeloner

**Files:**
- Modify: `netlify/functions/lib/handler.mjs` (hele filen)
- Modify: `netlify/functions/api.mjs`
- Test: `netlify/functions/lib/handler.test.mjs` (omskrives)

**Interfaces:**
- Consumes: Task 1 (`isValidUsername`, `isValidPassword`, `userKey`, `hashPassword`, `verifyPassword`), Task 2 (`safeEqual`, `signSession`, `verifySession`)
- Produces: `createHandler({ users, projects, env, now }) → (req: Request) => Promise<Response>` hvor
  - `users = { get(key): Promise<object|null>, create(key, value): Promise<boolean> }` (`false` = fandtes i forvejen)
  - `projects = { get(key), set(key, value), delete(key), list(prefix: string): Promise<string[]> }` (fulde nøgler)
  - `isValidProject` eksporteres uændret

- [ ] **Step 1: Omskriv testfilen**

```js
// netlify/functions/lib/handler.test.mjs
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
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Jens' }) }))
    const anna = cookieFor('anna')
    expect(await (await handle(req('GET', '/api/projects', { cookie: anna }))).json()).toEqual([])
    expect(await (await handle(req('GET', '/api/projects/a', { cookie: anna }))).json()).toBeNull()
    await handle(req('PUT', '/api/projects/a', { body: project('a', { name: 'Anna' }), cookie: anna }))
    await handle(req('DELETE', '/api/projects/a', { cookie: anna }))
    expect(projects.map.get('jens/a').name).toBe('Jens')
  })
})
```

- [ ] **Step 2: Kør og se dem fejle**

Run: `npx vitest run netlify/functions/lib/handler.test.mjs`
Expected: FAIL – bl.a. `/api/register` giver 401, `/api/me` giver 404

- [ ] **Step 3: Implementér handleren**

```js
// netlify/functions/lib/handler.mjs
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_S,
  safeEqual,
  signSession,
  verifySession,
  readCookie,
  sessionCookie,
  clearedCookie,
} from './session.mjs'
import { isValidUsername, isValidPassword, userKey, hashPassword, verifyPassword } from './password.mjs'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

// bruges når brugeren ikke findes, så svartiden ikke afslører det
const DUMMY_USER = { salt: '00'.repeat(16), hash: '00'.repeat(64) }

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
const decodeId = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return ''
  }
}
const readJSON = (req) => req.json().catch(() => null)

export function createHandler({ users, projects, env, now = Date.now }) {
  return async function handle(req) {
    const { SESSION_SECRET: secret, INVITE_CODE: invite } = env
    if (!secret || !invite) {
      console.error('Stitchboard: SESSION_SECRET og INVITE_CODE skal være sat')
      return empty(500)
    }

    const loggedIn = async (user) => {
      await migrateOwnerless({ projects, owner: env.OWNER_USERNAME, user })
      const value = signSession(secret, user, now() + SESSION_MAX_AGE_S * 1000)
      return empty(204, { 'Set-Cookie': sessionCookie(value) })
    }

    const path = new URL(req.url).pathname.replace(/\/+$/, '')
    const method = req.method

    if (path === '/api/register' && method === 'POST') {
      const body = await readJSON(req)
      // invitationskoden først, så man ikke kan undersøge hvilke navne der findes uden den
      if (!safeEqual(invite, body?.inviteCode)) return empty(403)
      if (!isValidUsername(body.username) || !isValidPassword(body.password)) return empty(400)
      const user = userKey(body.username)
      const record = { username: body.username, ...(await hashPassword(body.password)), createdAt: now() }
      if (!(await users.create(user, record))) return empty(409)
      return loggedIn(user)
    }

    if (path === '/api/login' && method === 'POST') {
      const body = await readJSON(req)
      if (!isValidUsername(body?.username) || !isValidPassword(body?.password)) return empty(401)
      const user = userKey(body.username)
      const record = await users.get(user)
      const ok = await verifyPassword(body.password, record ?? DUMMY_USER)
      if (!record || !ok) return empty(401)
      return loggedIn(user)
    }

    const user = verifySession(secret, readCookie(req.headers.get('cookie'), COOKIE_NAME), now())
    if (!user) return empty(401)

    if (path === '/api/logout' && method === 'POST') {
      return empty(204, { 'Set-Cookie': clearedCookie() })
    }

    if (path === '/api/me' && method === 'GET') {
      const record = await users.get(user)
      // brugeren er slettet manuelt – send vedkommende til login
      if (!record) return empty(401, { 'Set-Cookie': clearedCookie() })
      return Response.json({ username: record.username })
    }

    const prefix = `${user}/`

    // kun id'er – store skabeloner fylder ~1 MB hver, og et samlet svar ville ramme
    // Netlifys grænse for svarstørrelse; klienten henter hver skabelon for sig
    if (path === '/api/projects' && method === 'GET') {
      return Response.json((await projects.list(prefix)).map((k) => k.slice(prefix.length)))
    }

    const m = path.match(/^\/api\/projects\/([^/]+)$/)
    if (m && (method === 'GET' || method === 'PUT' || method === 'DELETE')) {
      const id = decodeId(m[1])
      // ID_RE tillader ikke '/', så et id kan aldrig nå ud af brugerens præfiks
      if (!ID_RE.test(id)) return empty(400)
      const key = prefix + id
      // manglende projekt giver null, ikke 404 – ved 404 prøver Netlify `<sti>.html`
      if (method === 'GET') return Response.json((await projects.get(key)) ?? null)
      if (method === 'DELETE') {
        await projects.delete(key)
        return empty(204)
      }
      const body = await readJSON(req)
      if (!isValidProject(body) || body.id !== id) return empty(400)
      await projects.set(key, body)
      return empty(204)
    }

    return empty(404)
  }
}

// Flyttes i Task 4 – her en tom stub, så Task 3 kan testes for sig
export async function migrateOwnerless() {}
```

- [ ] **Step 4: Kobl stores på i `netlify/functions/api.mjs`**

```js
// netlify/functions/api.mjs
import { getStore } from '@netlify/blobs'
import { createHandler } from './lib/handler.mjs'

export default async function api(req) {
  const userBlobs = getStore({ name: 'users', consistency: 'strong' })
  const projectBlobs = getStore({ name: 'projects', consistency: 'strong' })
  const handle = createHandler({
    env: process.env,
    users: {
      get: (key) => userBlobs.get(key, { type: 'json' }),
      // onlyIfNew: to samtidige tilmeldinger med samme navn kan ikke overskrive hinanden
      create: async (key, value) => (await userBlobs.setJSON(key, value, { onlyIfNew: true })).modified,
    },
    projects: {
      get: (key) => projectBlobs.get(key, { type: 'json' }),
      set: (key, value) => projectBlobs.setJSON(key, value),
      delete: (key) => projectBlobs.delete(key),
      list: async (prefix) => (await projectBlobs.list({ prefix })).blobs.map((b) => b.key),
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

- [ ] **Step 5: Kør alle server-tests**

Run: `npx vitest run netlify`
Expected: PASS

- [ ] **Step 6: Commit (kun efter godkendelse)**

```bash
git add netlify/functions
git commit -m "Replace shared password with per-user accounts and scoped projects"
```

---

### Task 4: Migrering af ejerløse skabeloner til OWNER_USERNAME

**Files:**
- Modify: `netlify/functions/lib/handler.mjs` (erstat stubben `migrateOwnerless`)
- Test: `netlify/functions/lib/handler.test.mjs` (ny `describe`)

**Interfaces:**
- Consumes: `projects`-store fra Task 3, `userKey` fra Task 1
- Produces: `migrateOwnerless({ projects, owner: string|undefined, user: string }): Promise<void>`

- [ ] **Step 1: Tilføj tests nederst i `handler.test.mjs`**

```js
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
```

- [ ] **Step 2: Kør og se dem fejle**

Run: `npx vitest run netlify/functions/lib/handler.test.mjs -t migrering`
Expected: FAIL – nøglerne er ikke flyttet

- [ ] **Step 3: Implementér** – erstat stubben nederst i `handler.mjs`:

```js
// Skabeloner fra før brugerkonti har ingen ejer. De flyttes til OWNER_USERNAME
// første gang den logger ind. Skriver før sletning, så intet mistes ved afbrydelse,
// og rører ikke en version der allerede er flyttet (den kan være redigeret siden).
export async function migrateOwnerless({ projects, owner, user }) {
  if (!owner || userKey(owner) !== user) return
  for (const key of await projects.list('')) {
    if (key.includes('/')) continue
    const target = `${user}/${key}`
    if (!(await projects.get(target))) {
      const p = await projects.get(key)
      if (p) await projects.set(target, p)
    }
    await projects.delete(key)
  }
}
```

- [ ] **Step 4: Kør alle server-tests**

Run: `npx vitest run netlify`
Expected: PASS

- [ ] **Step 5: Commit (kun efter godkendelse)**

```bash
git add netlify/functions/lib
git commit -m "Move ownerless templates to OWNER_USERNAME on first login"
```

---

### Task 5: Nulstillings-script og README

**Files:**
- Create: `scripts/reset-password.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `isValidUsername`, `isValidPassword`, `userKey`, `hashPassword` fra Task 1

- [ ] **Step 1: Skriv scriptet**

```js
// scripts/reset-password.mjs
// Brug: node scripts/reset-password.mjs <brugernavn> <ny-adgangskode>
// Udskriver en netlify-kommando der overskriver brugeren med en ny adgangskode.
import { isValidUsername, isValidPassword, userKey, hashPassword } from '../netlify/functions/lib/password.mjs'

const [username, password] = process.argv.slice(2)
if (!isValidUsername(username) || !isValidPassword(password)) {
  console.error('Brug: node scripts/reset-password.mjs <brugernavn> <ny-adgangskode (8–200 tegn)>')
  process.exit(1)
}

const record = { username, ...(await hashPassword(password)), createdAt: Date.now() }
// JSON'en indeholder kun hex og brugernavnets tilladte tegn, så enkelt-citater er sikre
console.log(`npx netlify-cli blobs:set users ${userKey(username)} '${JSON.stringify(record)}'`)
```

- [ ] **Step 2: Prøv det**

Run: `node scripts/reset-password.mjs Jens nykode123`
Expected: én linje `npx netlify-cli blobs:set users jens '{"username":"Jens","salt":"…","hash":"…","createdAt":…}'`

Run: `node scripts/reset-password.mjs J kort`
Expected: brugsbesked, exit-kode 1

- [ ] **Step 3: Opdatér README**

Erstat afsnittet "Projekter gemmes automatisk i en database (Netlify Blobs) bag en adgangskode, …" første sætning med:

```markdown
Hver bruger har sin egen konto, og projekter gemmes automatisk i en database (Netlify Blobs), så de er de samme på alle dine enheder.
```

Erstat `.env`-blokken under "Kør lokalt":

```
SESSION_SECRET=en-lang-tilfældig-streng
INVITE_CODE=koden-du-giver-til-dem-du-inviterer
OWNER_USERNAME=jens
```

Erstat punkt 3 under "Deploy på Netlify":

```markdown
3. Under **Site configuration → Environment variables**: sæt `SESSION_SECRET` (fx `openssl rand -hex 32`) og `INVITE_CODE`. Sæt `OWNER_USERNAME` til dit brugernavn, så skabeloner fra før brugerkonti flyttes til din konto første gang du logger ind. Skifter du `SESSION_SECRET`, logges alle enheder ud.
```

Tilføj efter "Deploy på Netlify"-afsnittet:

````markdown
## Brugere

**Invitér:** giv personen adressen og `INVITE_CODE`. De opretter selv en konto under **Opret konto**. Skift koden i Netlify, hvis den er sluppet ud – eksisterende konti påvirkes ikke.

**Nulstil adgangskode:** kør

```bash
node scripts/reset-password.mjs <brugernavn> <ny-adgangskode>
```

og kør den kommando scriptet udskriver (kræver `npx netlify-cli login` og at mappen er linket med `npx netlify-cli link`). Eksisterende sessioner på brugerens enheder forbliver logget ind.

**Slet bruger:** `npx netlify-cli blobs:delete users <brugernavn>`. Skabelonerne ligger under `<brugernavn>/` i store `projects` og slettes for sig (`blobs:list projects` / `blobs:delete projects <nøgle>`).
````

- [ ] **Step 4: Commit (kun efter godkendelse)**

```bash
git add scripts/reset-password.mjs README.md
git commit -m "Add password reset script and document accounts"
```

---

### Task 6: Klient-API og autogem ved brugerskift

**Files:**
- Modify: `src/api.js`, `src/api.test.js`
- Modify: `src/autosave.js`, `src/autosave.test.js`

**Interfaces:**
- Produces:
  - `login(username: string, password: string): Promise<boolean>`
  - `register(username, password, inviteCode): Promise<null | 'invalid' | 'invite' | 'taken'>`
  - `fetchMe(): Promise<{ username: string }>` (kaster `UnauthorizedError` ved 401)
  - `request` kaster `Error` med `.status` ved andre fejl end 401
  - autosave: `clear(): void` (dropper alle ventende og timere), pause efter 401 indtil `resume()` – mens den er sat på pause sender hverken timer, `markDirty`, `saveNow` eller `flushOnHide` noget

- [ ] **Step 1: Opdatér `api.test.js`**

Ret importen til `import { login, register, fetchMe, fetchProjects, saveProject, deleteProject, UnauthorizedError } from './api'` og erstat `describe('login', …)`:

```js
describe('login', () => {
  it('giver true ved succes', async () => {
    const f = stubFetch(respond(204))
    expect(await login('Jens', 'strikkepind')).toBe(true)
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/api/login')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ username: 'Jens', password: 'strikkepind' })
  })
  it('giver false ved forkert kode', async () => {
    stubFetch(respond(401))
    expect(await login('Jens', 'nej')).toBe(false)
  })
  it('kaster ved serverfejl', async () => {
    stubFetch(respond(500))
    await expect(login('Jens', 'strikkepind')).rejects.toThrow()
  })
})

describe('register', () => {
  it('giver null ved succes og sender alle felter', async () => {
    const f = stubFetch(respond(204))
    expect(await register('Anna', 'hæklenål1', 'kode')).toBeNull()
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/api/register')
    expect(JSON.parse(opts.body)).toEqual({ username: 'Anna', password: 'hæklenål1', inviteCode: 'kode' })
  })
  it('oversætter statuskoder til fejltyper', async () => {
    for (const [status, kind] of [[400, 'invalid'], [403, 'invite'], [409, 'taken']]) {
      stubFetch(respond(status))
      expect(await register('Anna', 'hæklenål1', 'kode')).toBe(kind)
    }
  })
  it('kaster ved serverfejl', async () => {
    stubFetch(respond(500))
    await expect(register('Anna', 'hæklenål1', 'kode')).rejects.toThrow()
  })
})

describe('fetchMe', () => {
  it('giver brugernavnet', async () => {
    stubFetch(respond(200, { username: 'Jens' }))
    expect(await fetchMe()).toEqual({ username: 'Jens' })
  })
  it('kaster UnauthorizedError ved 401', async () => {
    stubFetch(respond(401))
    await expect(fetchMe()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
```

- [ ] **Step 2: Tilføj tests i `autosave.test.js`** (inde i `describe('createAutosave', …)`)

```js
  it('sender intet efter 401 før resume – heller ikke ved skjult fane', async () => {
    const { a, projects, save } = setup()
    save.mockRejectedValueOnce(new UnauthorizedError())
    projects.set('a', { id: 'a' })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)
    a.markDirty('a')
    a.flushOnHide()
    await a.saveNow('a')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(1)
    await a.resume()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('clear dropper alle ventende og den planlagte retry', async () => {
    const { a, projects, save, onFailedChange } = setup()
    save.mockRejectedValueOnce(new Error('net'))
    projects.set('a', { id: 'a' })
    projects.set('b', { id: 'b' })
    a.markDirty('a')
    await vi.advanceTimersByTimeAsync(300)
    a.markDirty('b')
    a.clear()
    expect(a.hasPending()).toBe(false)
    expect(onFailedChange).toHaveBeenLastCalledWith(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 3: Kør og se dem fejle**

Run: `npx vitest run src/api.test.js src/autosave.test.js`
Expected: FAIL – `register is not a function`, `a.clear is not a function`, ekstra `save`-kald efter 401

- [ ] **Step 4: Implementér i `src/api.js`**

I `request` erstat linjen `if (!res.ok) throw new Error(...)`:

```js
  if (!res.ok) throw Object.assign(new Error(`Serverfejl (${res.status})`), { status: res.status })
```

Erstat `login` og tilføj `register` og `fetchMe`:

```js
export async function login(username, password) {
  try {
    await request('/api/login', { method: 'POST', body: { username, password } })
    return true
  } catch (e) {
    if (e instanceof UnauthorizedError) return false
    throw e
  }
}

const REGISTER_ERRORS = { 400: 'invalid', 403: 'invite', 409: 'taken' }

// null ved succes, ellers hvad der gik galt
export async function register(username, password, inviteCode) {
  try {
    await request('/api/register', { method: 'POST', body: { username, password, inviteCode } })
    return null
  } catch (e) {
    if (REGISTER_ERRORS[e.status]) return REGISTER_ERRORS[e.status]
    throw e
  }
}

export async function fetchMe() {
  return (await request('/api/me')).json()
}
```

- [ ] **Step 5: Implementér i `src/autosave.js`**

Tilføj `let paused = false` ved de andre `let`-variabler. I `run()` lige efter `timer = null`:

```js
    // efter 401 venter vi på login – en anden bruger kan logge ind i mellemtiden
    if (paused) return
```

I `catch`-blokken for `UnauthorizedError`, før `onUnauthorized()`:

```js
            paused = true
```

Erstat `resume` og tilføj `clear`; i `flushOnHide` tilføj en første linje:

```js
    resume() {
      paused = false
      return pending.size ? run() : Promise.resolve()
    },
    // når en anden bruger logger ind, må den forriges ændringer ikke sendes
    clear() {
      pending.clear()
      clearTimeout(timer)
      timer = null
      setFailed(false)
    },
```

```js
    flushOnHide() {
      if (paused) return
      // … resten uændret
```

- [ ] **Step 6: Kør tests**

Run: `npx vitest run src`
Expected: PASS

- [ ] **Step 7: Commit (kun efter godkendelse)**

```bash
git add src/api.js src/api.test.js src/autosave.js src/autosave.test.js
git commit -m "Add account API calls and pause autosave after session loss"
```

---

### Task 7: Login-/opret-skærm, brugernavn og brugerskift i UI

**Files:**
- Create: `src/signup.js`, `src/signup.test.js`
- Modify: `src/components/Login.jsx` (hele filen), `src/session.css`
- Modify: `src/App.jsx`, `src/components/Home.jsx`

**Interfaces:**
- Consumes: `login`, `register`, `fetchMe` (Task 6), `autosave.clear()` / `resume()` (Task 6)
- Produces: `validateSignup({ username, password, repeat, inviteCode }): string | null` (dansk fejltekst eller null); `Home` får prop `username: string`

- [ ] **Step 1: Skriv tests for klientvalidering**

```js
// src/signup.test.js
import { describe, it, expect } from 'vitest'
import { validateSignup } from './signup'

const ok = { username: 'Anna', password: 'hæklenål1', repeat: 'hæklenål1', inviteCode: 'kode' }

describe('validateSignup', () => {
  it('godtager gyldige felter', () => {
    expect(validateSignup(ok)).toBeNull()
  })
  it('melder ugyldigt brugernavn', () => {
    for (const username of ['ab', 'a.b', 'æble', 'x'.repeat(33)]) {
      expect(validateSignup({ ...ok, username })).toMatch(/Brugernavn/)
    }
  })
  it('melder for kort eller for lang adgangskode', () => {
    expect(validateSignup({ ...ok, password: 'kort', repeat: 'kort' })).toMatch(/8/)
    const long = 'x'.repeat(201)
    expect(validateSignup({ ...ok, password: long, repeat: long })).toMatch(/200/)
  })
  it('melder forskellige adgangskoder', () => {
    expect(validateSignup({ ...ok, repeat: 'noget-andet' })).toMatch(/ens/)
  })
  it('melder manglende invitationskode', () => {
    expect(validateSignup({ ...ok, inviteCode: '' })).toMatch(/invitationskode/)
  })
})
```

- [ ] **Step 2: Kør og se den fejle**

Run: `npx vitest run src/signup.test.js`
Expected: FAIL – `Failed to resolve import "./signup"`

- [ ] **Step 3: Implementér `src/signup.js`**

```js
// Samme regler som serveren (netlify/functions/lib/password.mjs), så brugeren
// får en forståelig besked før der sendes noget
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/

export function validateSignup({ username, password, repeat, inviteCode }) {
  if (!USERNAME_RE.test(username)) return 'Brugernavn skal være 3–32 tegn: bogstaver a–z, tal, _ eller -'
  if (password.length < 8) return 'Adgangskoden skal være mindst 8 tegn'
  if (password.length > 200) return 'Adgangskoden må højst være 200 tegn'
  if (password !== repeat) return 'De to adgangskoder er ikke ens'
  if (!inviteCode) return 'Skriv den invitationskode du har fået'
  return null
}
```

- [ ] **Step 4: Kør test**

Run: `npx vitest run src/signup.test.js`
Expected: PASS

- [ ] **Step 5: Omskriv `src/components/Login.jsx`**

```jsx
import { useState } from 'react'
import { Yarn } from './Icons'
import { login, register } from '../api'
import { validateSignup } from '../signup'

const REGISTER_MESSAGES = {
  invalid: 'Brugernavn eller adgangskode er ugyldigt',
  invite: 'Forkert invitationskode',
  taken: 'Brugernavnet er optaget',
}

export default function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'register'

  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (signup) {
      const invalid = validateSignup({ username, password, repeat, inviteCode })
      if (invalid) return setError(invalid)
    } else if (!username || !password) return
    setBusy(true)
    setError('')
    try {
      if (signup) {
        const problem = await register(username, password, inviteCode)
        if (!problem) return onLoggedIn()
        setError(REGISTER_MESSAGES[problem])
      } else {
        if (await login(username, password)) return onLoggedIn()
        setError('Forkert brugernavn eller adgangskode')
      }
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
        <div className="login-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!signup} onClick={() => switchMode('login')}>
            Log ind
          </button>
          <button type="button" role="tab" aria-selected={signup} onClick={() => switchMode('register')}>
            Opret konto
          </button>
        </div>
        <input
          className="input"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Brugernavn"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signup && (
          <>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Gentag adgangskode"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            <input
              className="input"
              autoComplete="off"
              placeholder="Invitationskode"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </>
        )}
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {signup ? 'Opret konto' : 'Log ind'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Tilføj styling i `src/session.css`** efter `.login-card h1 { … }`

```css
.login-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--brand-soft);
}
.login-tabs button {
  flex: 1;
  border: 0;
  padding: 8px;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.login-tabs button[aria-selected='true'] {
  background: var(--surface);
  color: var(--brand);
  box-shadow: var(--shadow);
}
.home-user {
  align-self: center;
  color: var(--muted);
  font-size: 14px;
}
```

- [ ] **Step 7: Opdatér `src/App.jsx`**

Import: tilføj `fetchMe` til importen fra `./api`.

Efter `const [saveFailed, …]`:

```jsx
  const [username, setUsername] = useState('')
  // hvis data på skærmen tilhører (små bogstaver) – bruges til at opdage brugerskift
  const owner = useRef(null)
```

Erstat `load`:

```jsx
  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const me = await fetchMe()
      const key = me.username.toLowerCase()
      if (owner.current !== null && owner.current !== key) {
        // en anden har logget ind i denne browser – den forriges ventende
        // ændringer må ikke ende på den nye konto
        autosave.current.clear()
        commit([])
        setOpenId(null)
      }
      owner.current = key
      setUsername(me.username)
      await refresh()
      setStatus('ready')
      autosave.current.resume()
    } catch (e) {
      setStatus(e instanceof UnauthorizedError ? 'login' : 'error')
    }
  }, [refresh, commit])
```

I `signOut`, erstat `for (const id of a.pendingIds()) a.forget(id)` med:

```jsx
    a.clear()
    owner.current = null
    setUsername('')
```

I `<Home …>` tilføj prop `username={username}`.

- [ ] **Step 8: Opdatér `src/components/Home.jsx`**

Tilføj `username,` i props-destruktureringen (efter `onLogout,`). Før `Log ud`-knappen:

```jsx
            <span className="home-user">Logget ind som {username}</span>
```

- [ ] **Step 9: Kør alle tests, lint og build**

Run: `npm test && npm run lint && npm run build`
Expected: alle tests PASS, ingen lint-fejl, build OK

- [ ] **Step 10: Manuel test med `npx netlify-cli dev`** (`.env` med `SESSION_SECRET`, `INVITE_CODE`, `OWNER_USERNAME`)

1. Opret konto med forkert invitationskode → "Forkert invitationskode".
2. Opret `Jens` med korrekt kode → forsiden viser "Logget ind som Jens" og de gamle skabeloner (migrering).
3. Log ud, opret `Anna` → tom forside. Opret en skabelon.
4. Log ud, log ind som `jens` (små bogstaver) → kun Jens' skabeloner.
5. Opret `JENS` → "Brugernavnet er optaget". (Bekræfter at `onlyIfNew` virker i det lokale Blobs-lager.)

- [ ] **Step 11: Commit (kun efter godkendelse)**

```bash
git add src README.md
git commit -m "Add sign-up tab, show username and drop pending edits on user switch"
```
