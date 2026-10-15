import { useCallback, useEffect, useRef, useState } from 'react'
import Home from './components/Home'
import Editor from './components/Editor'
import Login from './components/Login'
import { newProject, uid } from './state'
import { fetchMe, fetchProjects, saveProject, deleteProject, logout, UnauthorizedError } from './api'
import { createAutosave, refreshFromServer } from './autosave'
import { readLocalProjects, markLocalImported, normalizeImport } from './storage'
import './session.css'

export default function App() {
  const [status, setStatus] = useState('loading') // 'loading' | 'login' | 'ready' | 'error'
  const [projects, setProjects] = useState([])
  const [openId, setOpenId] = useState(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [username, setUsername] = useState('')
  // hvis data på skærmen tilhører (små bogstaver) – bruges til at opdage brugerskift
  const owner = useRef(null)
  // skabeloner der stadig ligger i browseren fra før databasen
  const [localProjects, setLocalProjects] = useState(() => readLocalProjects())

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

  // ændringer der ikke er nået frem (fx før login udløb), vinder over serverens version
  const refresh = useCallback(
    () =>
      refreshFromServer({
        fetchProjects,
        getLocal: () => latest.current,
        pendingIds: () => autosave.current.pendingIds(),
        commit,
      }),
    [commit],
  )

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

  useEffect(() => {
    load()
  }, [load])

  // uanset hvilket kald der fik 401: hold autogem tilbage til vi ved hvem der logger ind
  useEffect(() => {
    if (status === 'login') autosave.current.pause()
  }, [status])

  // hent nyeste når fanen bliver synlig igen, så en gammel fane ikke overskriver
  // ændringer fra en anden enhed (fx strikke-fremdrift fra telefonen)
  const ready = status === 'ready'
  useEffect(() => {
    if (!ready) return
    const onVisible = () => {
      if (document.hidden) return
      refresh().catch((e) => {
        if (e instanceof UnauthorizedError) setStatus('login')
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ready, refresh])

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
    const p = normalizeImport(data)
    if (!p) {
      alert('Det ligner ikke en skabelon-fil.')
      return
    }
    addAndSave(p)
    setOpenId(p.id)
  }

  const importLocal = () => {
    const ps = localProjects.map(normalizeImport).filter(Boolean)
    commit([...ps, ...latest.current])
    for (const p of ps) autosave.current.saveNow(p.id)
    markLocalImported()
    setLocalProjects([])
  }

  const signOut = async () => {
    const a = autosave.current
    if (a.hasPending() && !confirm('Nogle ændringer er ikke gemt endnu. Log ud alligevel?')) return
    try {
      await logout()
    } catch {
      // vi viser login-skærmen alligevel
    }
    a.clear()
    owner.current = null
    setUsername('')
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
          localCount={localProjects.length}
          onImportLocal={importLocal}
          onLogout={signOut}
          username={username}
        />
      )}
    </>
  )
}
