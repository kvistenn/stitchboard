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
  let paused = false

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
    // efter 401 venter vi på login – en anden bruger kan logge ind i mellemtiden
    if (paused) return
    if (running) return // det igangværende gem planlægger selv en ny runde
    running = true
    let error = false
    try {
      for (const id of [...pending]) {
        const project = getProject(id)
        if (!project) {
          pending.delete(id)
          continue
        }
        try {
          await save(project)
          // bliver ventende indtil netop den sendte version er gemt, så en lukket
          // fane advarer under upload og en ændring undervejs sendes bagefter
          if (getProject(id) === project) pending.delete(id)
        } catch (e) {
          if (e instanceof UnauthorizedError) {
            paused = true
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
    // login-skærmen vises – intet må sendes før vi ved hvem der logger ind
    pause() {
      paused = true
      clearTimeout(timer)
      timer = null
    },
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
    hasPending: () => pending.size > 0,
    pendingIds: () => new Set(pending),
    flushOnHide() {
      if (paused) return
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

// Lokale tilstand og ventende id'er læses først når svaret er kommet,
// så ændringer lavet mens der hentes ikke overskrives
export async function refreshFromServer({ fetchProjects, getLocal, pendingIds, commit }) {
  const remote = await fetchProjects()
  commit(mergePending(remote, getLocal(), pendingIds()))
}

export function mergePending(remote, local, ids) {
  const byId = new Map(remote.map((p) => [p.id, p]))
  for (const p of local) if (ids.has(p.id)) byId.set(p.id, p)
  return [...byId.values()]
}
