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
