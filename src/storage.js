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
