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
const decodeId = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return ''
  }
}
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
      const id = decodeId(m[1])
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
