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
  if (!res.ok) throw Object.assign(new Error(`Serverfejl (${res.status})`), { status: res.status })
  return res
}

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

export async function logout() {
  await request('/api/logout', { method: 'POST' })
}

export async function fetchProjects() {
  const ids = await (await request('/api/projects')).json()
  const projects = await Promise.all(
    // null = slettet imens
    ids.map(async (id) => (await request(`/api/projects/${encodeURIComponent(id)}`)).json()),
  )
  return projects.filter(Boolean)
}

export async function saveProject(project, { keepalive = false } = {}) {
  await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: project, keepalive })
}

export async function deleteProject(id) {
  await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
