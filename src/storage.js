import { edgesFromShape, shapeFromEdges } from './state'

const KEY = 'strikkeskabelon.projects.v1'

function migrate(p) {
  if (Array.isArray(p.hEdges) && Array.isArray(p.vEdges)) return p
  const edges = edgesFromShape(p.cols, p.rows, p.shape)
  return { ...p, ...edges, shape: shapeFromEdges(p.cols, p.rows, edges.hEdges, edges.vEdges).shape }
}

export function loadProjects() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(migrate) : []
  } catch {
    return []
  }
}

export function saveProjects(projects) {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects))
  } catch (e) {
    console.warn('Kunne ikke gemme', e)
  }
}

export function downloadJSON(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${project.name || 'skabelon'}.strik.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      try {
        resolve(JSON.parse(fr.result))
      } catch (e) {
        reject(e)
      }
    }
    fr.onerror = reject
    fr.readAsText(file)
  })
}
