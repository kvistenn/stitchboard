import { newProject, uid, edgesFromShape, shapeFromEdges } from './state'

// Nøgler fra før skabelonerne blev gemt i databasen (nyeste først)
const OLD_KEYS = ['stitchboard.projects.v1', 'strikkeskabelon.projects.v1']
const IMPORTED_KEY = 'stitchboard.localImported'

// Skabeloner der stadig ligger i browseren. De slettes ikke – efter hentning
// sættes blot et flag, så de ikke tilbydes igen.
export function readLocalProjects(storage = globalThis.localStorage) {
  try {
    if (!storage || storage.getItem(IMPORTED_KEY)) return []
    for (const key of OLD_KEYS) {
      const arr = JSON.parse(storage.getItem(key) || 'null')
      if (Array.isArray(arr) && arr.length) return arr
    }
  } catch {
    // ødelagte data – der er intet at hente
  }
  return []
}

export function markLocalImported(storage = globalThis.localStorage) {
  try {
    storage.setItem(IMPORTED_KEY, '1')
  } catch {
    // privat vindue o.l. – knappen kommer bare igen næste gang
  }
}

// Gør en importeret skabelon (fil eller browser) klar: nyt id, standardværdier
// og kanter udledt af `shape` for filer fra før kanterne fandtes
export function normalizeImport(data) {
  if (!data || !Array.isArray(data.shape) || !data.cols || !data.rows) return null
  const base = newProject(data.name || 'Importeret', data.cols, data.rows)
  const p = { ...base, ...data, id: uid(), knit: { ...base.knit, ...(data.knit || {}) }, updatedAt: Date.now() }
  if (!Array.isArray(p.hEdges) || !Array.isArray(p.vEdges)) {
    Object.assign(p, edgesFromShape(p.cols, p.rows, p.shape))
  }
  p.shape = shapeFromEdges(p.cols, p.rows, p.hEdges, p.vEdges).shape
  return p
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
