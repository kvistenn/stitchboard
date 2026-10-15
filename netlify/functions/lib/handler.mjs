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
      console.error('Rowby: SESSION_SECRET og INVITE_CODE skal være sat')
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
    // en manuelt slettet bruger må ikke beholde adgangen via en gammel cookie
    const record = await users.get(user)
    if (!record) return empty(401, { 'Set-Cookie': clearedCookie() })

    if (path === '/api/logout' && method === 'POST') {
      return empty(204, { 'Set-Cookie': clearedCookie() })
    }

    if (path === '/api/me' && method === 'GET') {
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

// Skabeloner fra før brugerkonti har ingen ejer. De flyttes til OWNER_USERNAME
// første gang den logger ind. Skriver før sletning, så intet mistes ved afbrydelse,
// og rører ikke en version der allerede er flyttet (den kan være redigeret siden).
export async function migrateOwnerless({ projects, owner, user }) {
  if (!owner || userKey(owner) !== user) return
  for (const key of await projects.list('')) {
    if (key.includes('/')) continue
    // én ødelagt skabelon må ikke spærre ejeren ude – den prøves igen næste login
    try {
      const target = `${user}/${key}`
      if (!(await projects.get(target))) {
        const p = await projects.get(key)
        if (p) await projects.set(target, p)
      }
      await projects.delete(key)
    } catch (e) {
      console.error(`Rowby: kunne ikke flytte skabelonen "${key}"`, e)
    }
  }
}
