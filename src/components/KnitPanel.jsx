import { useEffect, useMemo, useCallback, Fragment } from 'react'
import { knitPlan, rowDirection, rowSegments, rowText, segmentText, stitchesInRow } from '../state'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Speaker, SpeakerOff, Reset } from './Icons'

/**
 * Hvor man er i strikningen. Hvert spor i planen (én skabelon, eller flere strikket samlet)
 * har sin egen række k; segs er alle sporenes farveskift efter hinanden, så "næste" går
 * fra forsiden videre til bagsiden i samme omgang.
 */
export function useKnitState(project, templates) {
  const plan = useMemo(() => knitPlan(project, templates), [project, templates])
  const { total } = plan
  const rowIdx = Math.min(project.knit.row, Math.max(0, total - 1))
  const dir = rowDirection(project, rowIdx)
  return useMemo(() => {
    const parts = plan.tracks.map((track) => {
      const gridRow = track.rows[rowIdx]
      return {
        track,
        gridRow,
        segs: gridRow === undefined ? [] : rowSegments(project, gridRow, dir, track.mask),
      }
    })
    const segs = parts.flatMap((p, part) => p.segs.map((s) => ({ ...s, part })))
    const segIdx = Math.min(project.knit.seg, Math.max(0, segs.length - 1))
    return { plan, total, rowIdx, dir, parts, segs, segIdx }
  }, [plan, total, rowIdx, dir, project])
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

export default function KnitPanel({ project, templates, knit, onKnit }) {
  const { plan, total, rowIdx, dir, parts, segs, segIdx } = knit
  const multi = parts.length > 1

  const setKnit = useCallback((patch) => onKnit({ ...project.knit, ...patch }), [project.knit, onKnit])

  // standard: hele rækken ad gangen; som indstilling ét farveskift ad gangen
  const bySeg = !!project.knit.stepBySegment

  const gotoRow = useCallback(
    (i) => {
      const n = Math.max(0, Math.min(total - 1, i))
      setKnit({ row: n, seg: 0 })
    },
    [total, setKnit],
  )

  const nextSeg = useCallback(() => {
    if (bySeg && segIdx < segs.length - 1) setKnit({ seg: segIdx + 1 })
    else if (rowIdx < total - 1) setKnit({ row: rowIdx + 1, seg: 0 })
  }, [bySeg, segIdx, segs.length, rowIdx, total, setKnit])

  const prevSeg = useCallback(() => {
    if (bySeg && segIdx > 0) setKnit({ seg: segIdx - 1 })
    else if (rowIdx > 0) setKnit({ row: rowIdx - 1, seg: 0 })
  }, [bySeg, segIdx, rowIdx, setKnit])

  const toggleFocus = (t) => {
    const on = plan.focus.includes(t)
    const next = templates.list.filter((x) => (x === t ? !on : plan.focus.includes(x)))
    if (!next.length) return
    setKnit({ focus: next.map((x) => x.key), seg: 0 })
  }

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
  const text = parts
    .map((p) => (multi ? p.track.label + ': ' : '') + (p.gridRow === undefined ? 'færdig' : rowText(project, p.segs)))
    .join('. ')
  useEffect(() => {
    if (!project.knit.speak || !total) return
    speak(`Række ${rowIdx + 1}. ${text}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIdx, project.knit.speak])

  const templatePicker = (
    <div className="tpl-list">
      <div className="eyebrow">Skabeloner</div>
      {templates.list.map((t) => {
        const on = plan.focus.includes(t)
        return (
          <label key={t.key} className="tpl-check">
            <input
              type="checkbox"
              checked={on}
              disabled={on && plan.focus.length === 1}
              onChange={(e) => {
                // slip fokus igen, så piletaster og mellemrum styrer strikningen
                e.target.blur()
                toggleFocus(t)
              }}
            />
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-size">
              {t.c1 - t.c0 + 1} × {t.r1 - t.r0 + 1}
            </span>
          </label>
        )
      })}
      {plan.focus.length > 1 && (
        <>
          <label className="tpl-check sync">
            <input
              type="checkbox"
              checked={project.knit.sync !== false}
              onChange={(e) => {
                e.target.blur()
                setKnit({ sync: e.target.checked, seg: 0 })
              }}
            />
            <span className="tpl-name">Følg synkront</span>
          </label>
          <p className="hint">
            {plan.sync
              ? 'Række 1 i hver skabelon strikkes sammen, talt fra hver skabelons egen start – fx for- og bagside.'
              : 'Skabelonerne følger lærredets rækker, som hvis de lå på samme pind.'}
          </p>
        </>
      )}
    </div>
  )

  if (total === 0) {
    return (
      <div className="panel">
        <h3>Strik</h3>
        <p className="muted">Skabelonen er tom. Gå tilbage til Skabelon og tegn dit udsnit.</p>
      </div>
    )
  }

  const progress = Math.round((rowIdx / total) * 100)
  const single = parts[0]

  let offset = 0
  return (
    <div className="panel knit-panel">
      {templatePicker}

      <div className="knit-head">
        <div>
          <div className="eyebrow">
            Række {rowIdx + 1} af {total}
          </div>
          {!multi && single.gridRow !== undefined && (
            <div className="knit-rownum">
              Diagramrække {project.rows - single.gridRow} ·{' '}
              {stitchesInRow(project, single.gridRow, single.track.mask)} m
            </div>
          )}
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
        {parts.map((p, pi) => {
          const start = offset
          offset += p.segs.length
          return (
            <Fragment key={pi}>
              {multi && (
                <div className="seg-group">
                  {p.track.label}
                  <span>
                    {p.gridRow === undefined
                      ? 'færdig'
                      : `diagramrække ${project.rows - p.gridRow} · ${stitchesInRow(project, p.gridRow, p.track.mask)} m`}
                  </span>
                </div>
              )}
              {p.segs.map((s, j) => {
                const i = start + j
                return (
                  <button
                    key={i}
                    className={
                      'seg' +
                      (bySeg ? (i === segIdx ? ' current' : i < segIdx ? ' done' : '') : '') +
                      (s.inside ? '' : ' gap')
                    }
                    onClick={bySeg ? () => setKnit({ seg: i }) : undefined}
                  >
                    {s.inside && <span className="seg-dot" style={{ background: s.color || '#fff' }} />}
                    <span className="seg-text">{segmentText(project, s)}</span>
                  </button>
                )
              })}
            </Fragment>
          )
        })}
      </div>

      {bySeg ? (
        <>
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
        </>
      ) : (
        <>
          <div className="knit-controls">
            <button
              className="btn ghost"
              onClick={() => gotoRow(rowIdx - 1)}
              disabled={rowIdx === 0}
              title="Forrige række (↓)"
            >
              <ChevronDown /> Forrige række
            </button>
            <button
              className="btn primary"
              onClick={() => gotoRow(rowIdx + 1)}
              disabled={rowIdx >= total - 1}
              title="Næste række (mellemrum / Enter / ↑)"
            >
              Næste række <ChevronUp />
            </button>
          </div>
          <p className="hint">
            Mellemrum / Enter / ↑ næste række · ↓ forrige række. Klik på en række i diagrammet for at hoppe dertil.
          </p>
        </>
      )}

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
          <span>Fremgang</span>
          <select
            className="input"
            value={bySeg ? 'segment' : 'row'}
            onChange={(e) => setKnit({ stepBySegment: e.target.value === 'segment', seg: 0 })}
          >
            <option value="row">Hele rækken ad gangen (standard)</option>
            <option value="segment">Ét farveskift ad gangen</option>
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
