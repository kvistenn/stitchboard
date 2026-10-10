import { useEffect, useMemo, useCallback } from 'react'
import { knitRowList, rowDirection, rowSegments, rowText, segmentText, stitchesInRow } from '../state'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Speaker, SpeakerOff, Reset } from './Icons'

export function useKnitState(project) {
  const rowList = useMemo(() => knitRowList(project), [project])
  const total = rowList.length
  const rowIdx = Math.min(project.knit.row, Math.max(0, total - 1))
  const gridRow = rowList[rowIdx]
  const dir = rowDirection(project, rowIdx)
  const segs = useMemo(
    () => (gridRow === undefined ? [] : rowSegments(project, gridRow, dir)),
    [project, gridRow, dir],
  )
  const segIdx = Math.min(project.knit.seg, Math.max(0, segs.length - 1))
  return { rowList, total, rowIdx, gridRow, dir, segs, segIdx }
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'da-DK'
  const voices = window.speechSynthesis.getVoices()
  const da = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('da'))
  if (da) u.voice = da
  u.rate = 0.95
  window.speechSynthesis.speak(u)
}

export default function KnitPanel({ project, onKnit }) {
  const { total, rowIdx, gridRow, dir, segs, segIdx } = useKnitState(project)

  const setKnit = useCallback((patch) => onKnit({ ...project.knit, ...patch }), [project.knit, onKnit])

  const gotoRow = useCallback(
    (i) => {
      const n = Math.max(0, Math.min(total - 1, i))
      setKnit({ row: n, seg: 0 })
    },
    [total, setKnit],
  )

  const nextSeg = useCallback(() => {
    if (segIdx < segs.length - 1) setKnit({ seg: segIdx + 1 })
    else if (rowIdx < total - 1) setKnit({ row: rowIdx + 1, seg: 0 })
  }, [segIdx, segs.length, rowIdx, total, setKnit])

  const prevSeg = useCallback(() => {
    if (segIdx > 0) setKnit({ seg: segIdx - 1 })
    else if (rowIdx > 0) setKnit({ row: rowIdx - 1, seg: 0 })
  }, [segIdx, rowIdx, setKnit])

  // tastatur: ← → / mellemrum = segment, ↑ ↓ / Enter = række
  useEffect(() => {
    const h = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        nextSeg()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevSeg()
      } else if (e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        gotoRow(rowIdx + 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        gotoRow(rowIdx - 1)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [nextSeg, prevSeg, gotoRow, rowIdx])

  // oplæsning når rækken skifter
  const text = rowText(project, segs)
  useEffect(() => {
    if (!project.knit.speak || gridRow === undefined) return
    speak(`Række ${rowIdx + 1}. ${text}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIdx, project.knit.speak])

  if (total === 0) {
    return (
      <div className="panel">
        <h3>Strik</h3>
        <p className="muted">Skabelonen er tom. Gå tilbage til Skabelon og tegn dit udsnit.</p>
      </div>
    )
  }

  const stitches = stitchesInRow(project, gridRow)
  const progress = Math.round((rowIdx / total) * 100)
  const humanRow = project.rows - gridRow // nummer som i margenen (nedefra)

  return (
    <div className="panel knit-panel">
      <div className="knit-head">
        <div>
          <div className="eyebrow">Række {rowIdx + 1} af {total}</div>
          <div className="knit-rownum">
            Diagramrække {humanRow} · {stitches} m
          </div>
        </div>
        <button
          className={'icon-btn' + (project.knit.speak ? ' on' : '')}
          title={project.knit.speak ? 'Slå oplæsning fra' : 'Læs rækker højt'}
          onClick={() => {
            const on = !project.knit.speak
            setKnit({ speak: on })
            if (on) speak(`Række ${rowIdx + 1}. ${text}`)
          }}
        >
          {project.knit.speak ? <Speaker /> : <SpeakerOff />}
        </button>
      </div>

      <div className="progress">
        <div className="progress-bar" style={{ width: progress + '%' }} />
      </div>

      <div className="dir-pill">
        {dir === 'rtl' ? '→ læses fra højre mod venstre' : '← læses fra venstre mod højre'}
      </div>

      <div className="seg-list">
        {segs.map((s, i) => (
          <button
            key={i}
            className={
              'seg' + (i === segIdx ? ' current' : i < segIdx ? ' done' : '') + (s.inside ? '' : ' gap')
            }
            onClick={() => setKnit({ seg: i })}
          >
            {s.inside && <span className="seg-dot" style={{ background: s.color || '#fff' }} />}
            <span className="seg-text">{segmentText(project, s)}</span>
          </button>
        ))}
      </div>

      <div className="knit-controls">
        <button className="btn ghost" onClick={prevSeg} title="Forrige (←)">
          <ChevronLeft /> Forrige
        </button>
        <button className="btn primary" onClick={nextSeg} title="Næste (mellemrum / →)">
          Næste <ChevronRight />
        </button>
      </div>
      <div className="knit-controls">
        <button className="btn ghost small" onClick={() => gotoRow(rowIdx - 1)} disabled={rowIdx === 0}>
          <ChevronDown /> Forrige række
        </button>
        <button
          className="btn ghost small"
          onClick={() => gotoRow(rowIdx + 1)}
          disabled={rowIdx >= total - 1}
        >
          Næste række <ChevronUp />
        </button>
      </div>

      <p className="hint">
        Mellemrum / → næste farveskift · Enter / ↑ næste række. Klik på en række i diagrammet for at hoppe dertil.
      </p>

      <details className="settings">
        <summary>Indstillinger</summary>
        <label className="field col">
          <span>Start</span>
          <select
            className="input"
            value={project.knit.startFrom}
            onChange={(e) => setKnit({ startFrom: e.target.value, row: 0, seg: 0 })}
          >
            <option value="bottom">Nederst (standard)</option>
            <option value="top">Øverst</option>
          </select>
        </label>
        <label className="field col">
          <span>Strikkes</span>
          <select
            className="input"
            value={project.knit.direction}
            onChange={(e) => setKnit({ direction: e.target.value, seg: 0 })}
          >
            <option value="round">Rundt (altid samme retning)</option>
            <option value="flat">Frem og tilbage (skiftevis)</option>
          </select>
        </label>
        <label className="field col">
          <span>Første række læses</span>
          <select
            className="input"
            value={project.knit.firstSide || 'rtl'}
            onChange={(e) => setKnit({ firstSide: e.target.value, seg: 0 })}
          >
            <option value="rtl">Højre → venstre</option>
            <option value="ltr">Venstre → højre</option>
          </select>
        </label>
        <button className="btn ghost small" onClick={() => setKnit({ row: 0, seg: 0 })}>
          <Reset width={16} height={16} /> Start forfra
        </button>
      </details>
    </div>
  )
}
