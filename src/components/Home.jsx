import { useEffect, useRef, useState } from 'react'
import { Plus, Trash, Upload, Copy, Yarn } from './Icons'
import { readJSONFile } from '../storage'

function Thumb({ project }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const W = 260
    const H = 160
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f6f7fa'
    ctx.fillRect(0, 0, W, H)
    const cs = Math.max(1, Math.floor(Math.min((W - 16) / project.cols, (H - 16) / project.rows)))
    const ox = Math.floor((W - cs * project.cols) / 2)
    const oy = Math.floor((H - cs * project.rows) / 2)
    for (let r = 0; r < project.rows; r++) {
      for (let c = 0; c < project.cols; c++) {
        const i = r * project.cols + c
        if (!project.shape[i]) continue
        ctx.fillStyle = project.colors[i] || '#ffffff'
        ctx.fillRect(ox + c * cs, oy + r * cs, cs, cs)
      }
    }
    if (cs >= 4) {
      ctx.strokeStyle = 'rgba(15,23,42,0.08)'
      for (let r = 0; r <= project.rows; r++) {
        ctx.beginPath()
        ctx.moveTo(ox, oy + r * cs + 0.5)
        ctx.lineTo(ox + project.cols * cs, oy + r * cs + 0.5)
        ctx.stroke()
      }
      for (let c = 0; c <= project.cols; c++) {
        ctx.beginPath()
        ctx.moveTo(ox + c * cs + 0.5, oy)
        ctx.lineTo(ox + c * cs + 0.5, oy + project.rows * cs)
        ctx.stroke()
      }
    }
  }, [project])
  return <canvas ref={ref} className="thumb" />
}

export default function Home({
  projects,
  onOpen,
  onCreate,
  onDelete,
  onDuplicate,
  onImport,
  localCount,
  onImportLocal,
  onLogout,
}) {
  const [cols, setCols] = useState(40)
  const [rows, setRows] = useState(60)
  const [name, setName] = useState('')
  const fileRef = useRef(null)

  const create = () => {
    onCreate(name.trim() || 'Nyt projekt', Number(cols), Number(rows))
  }

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-inner">
          <div className="hero-badge">
            <Yarn /> Stitchboard
          </div>
          <h1>Hvad vil du strikke i dag?</h1>
          <p>Tegn din skabelon, læg et farvemønster og lad appen læse op række for række, mens du strikker.</p>
          <div className="create-card">
            <input
              className="input"
              placeholder="Navn, fx Vinter-sokker"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <label className="field">
              <span>Masker</span>
              <input
                className="input num"
                type="number"
                min="1"
                max="300"
                value={cols}
                onChange={(e) => setCols(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Rækker</span>
              <input
                className="input num"
                type="number"
                min="1"
                max="300"
                value={rows}
                onChange={(e) => setRows(e.target.value)}
              />
            </label>
            <button className="btn primary" onClick={create}>
              <Plus /> Opret skabelon
            </button>
          </div>
        </div>
      </div>

      <div className="home-body">
        <div className="home-row">
          <h2>Dine skabeloner</h2>
          <div className="home-actions">
            {localCount > 0 && (
              <button
                className="btn primary"
                title="Skabeloner der stadig ligger i denne browser fra før de blev gemt online"
                onClick={onImportLocal}
              >
                <Upload /> Hent {localCount} fra denne browser
              </button>
            )}
            <button className="btn ghost" onClick={() => fileRef.current.click()}>
              <Upload /> Importér fil
            </button>
            <button className="btn ghost" onClick={onLogout}>
              Log ud
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files[0]
              if (!f) return
              try {
                onImport(await readJSONFile(f))
              } catch {
                alert('Filen kunne ikke læses.')
              }
              e.target.value = ''
            }}
          />
        </div>

        {projects.length === 0 && (
          <div className="empty">Du har ingen skabeloner endnu. Opret din første ovenfor.</div>
        )}

        <div className="project-grid">
          {projects
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((p) => (
              <div key={p.id} className="project-card">
                <button className="project-thumb" onClick={() => onOpen(p.id)}>
                  <Thumb project={p} />
                </button>
                <div className="project-meta">
                  <div>
                    <div className="project-name">{p.name}</div>
                    <div className="project-sub">
                      {p.cols} × {p.rows} · {new Date(p.updatedAt).toLocaleDateString('da-DK')}
                    </div>
                  </div>
                  <div className="project-actions">
                    <button className="icon-btn subtle" title="Dupliker" onClick={() => onDuplicate(p.id)}>
                      <Copy width={16} height={16} />
                    </button>
                    <button
                      className="icon-btn subtle"
                      title="Slet"
                      onClick={() => confirm(`Slet "${p.name}"?`) && onDelete(p.id)}
                    >
                      <Trash width={16} height={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
