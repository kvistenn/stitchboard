import { useCallback, useEffect, useRef, useState } from 'react'
import Home from './components/Home'
import Editor from './components/Editor'
import { newProject, uid } from './state'
import { loadProjects, saveProjects } from './storage'

export default function App() {
  const [projects, setProjects] = useState(() => loadProjects())
  const [openId, setOpenId] = useState(null)

  // autosave (let forsinket så hurtige strøg ikke skriver for hver celle)
  const timer = useRef(null)
  const latest = useRef(projects)
  latest.current = projects
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveProjects(projects), 300)
    return () => clearTimeout(timer.current)
  }, [projects])
  // gem straks hvis fanen lukkes/skjules
  useEffect(() => {
    const flush = () => saveProjects(latest.current)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => document.hidden && flush())
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const project = projects.find((p) => p.id === openId) || null

  const updateProject = useCallback((next) => {
    next = { ...next, updatedAt: Date.now() }
    setProjects((ps) => ps.map((p) => (p.id === next.id ? next : p)))
  }, [])

  const create = (name, cols, rows) => {
    const p = newProject(name, cols, rows)
    setProjects((ps) => [p, ...ps])
    setOpenId(p.id)
  }

  const remove = (id) => {
    setProjects((ps) => ps.filter((p) => p.id !== id))
    if (openId === id) setOpenId(null)
  }

  const duplicate = (id) => {
    const src = projects.find((p) => p.id === id)
    if (!src) return
    const copy = { ...src, id: uid(), name: src.name + ' (kopi)', createdAt: Date.now(), updatedAt: Date.now() }
    setProjects((ps) => [copy, ...ps])
  }

  const importProject = (data) => {
    if (!data || !Array.isArray(data.shape) || !data.cols || !data.rows) {
      alert('Det ligner ikke en skabelon-fil.')
      return
    }
    const base = newProject(data.name || 'Importeret', data.cols, data.rows)
    const p = { ...base, ...data, id: uid(), knit: { ...base.knit, ...(data.knit || {}) }, updatedAt: Date.now() }
    setProjects((ps) => [p, ...ps])
    setOpenId(p.id)
  }

  if (project) {
    return <Editor key={project.id} project={project} onChange={updateProject} onBack={() => setOpenId(null)} />
  }

  return (
    <Home
      projects={projects}
      onOpen={setOpenId}
      onCreate={create}
      onDelete={remove}
      onDuplicate={duplicate}
      onImport={importProject}
    />
  )
}
