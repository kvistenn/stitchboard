import { useEffect, useRef, useState } from 'react'
import Login from './Login'
import { Logo, Speaker, Upload, Image, Download, Check } from './Icons'
import { DEMO_COLORS, DEMO_PATTERN, describeRow } from '../landing'
import '../landing.css'

const CELL = 22 // feltstørrelse inkl. mellemrum
const GAP = 2
const ROW_MS = 450 // tid pr. strikket række
const PAUSE_MS = 3000 // pause når mønsteret er færdigt, før det starter forfra

// alle mulige oplæsninger ligger usynligt i samme celle, så boksen altid har højden af den højeste
// (den med flest tegn er ikke altid den der bryder over flest linjer)
const FINISHED_TEXT = 'Færdig – godt strikket!'
const readoutText = (done, total) =>
  done >= total ? FINISHED_TEXT : `Række ${done + 1}: ${describeRow(DEMO_PATTERN[total - 1 - done])}`
const ALL_READOUTS = DEMO_PATTERN.map((_, i) => readoutText(i, DEMO_PATTERN.length)).concat(FINISHED_TEXT)

// "Række 3: 2 hvid, …" med fed label – samme opmærkning for synlig og usynlig tekst, så bredden er ens
function Readout({ text }) {
  const i = text.indexOf(': ')
  if (i < 0) return text
  return (
    <>
      <b>{text.slice(0, i + 1)}</b>
      {text.slice(i + 1)}
    </>
  )
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Animeret strikkegitter: rækkerne strikkes nedefra og op, og den aktive række læses som i appen
function KnitDemo() {
  const total = DEMO_PATTERN.length
  const [reduced] = useState(prefersReducedMotion)
  const [done, setDone] = useState(() => (reduced ? total : 0))

  useEffect(() => {
    if (reduced) return
    const t = setTimeout(() => setDone((d) => (d >= total ? 0 : d + 1)), done >= total ? PAUSE_MS : ROW_MS)
    return () => clearTimeout(t)
  }, [done, reduced, total])

  const finished = done >= total
  const active = total - 1 - done // indeks i DEMO_PATTERN (0 = øverste række)
  const cols = DEMO_PATTERN[0].length

  return (
    <figure className="knit-demo" aria-hidden="true">
      <svg viewBox={`0 0 ${cols * CELL} ${total * CELL}`} className="knit-demo-grid">
        {DEMO_PATTERN.map((row, r) =>
          [...row].map((key, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * CELL + GAP / 2}
              y={r * CELL + GAP / 2}
              width={CELL - GAP}
              height={CELL - GAP}
              rx={4}
              className={r > active ? 'stitch' : 'stitch empty'}
              style={r > active ? { fill: DEMO_COLORS[key].fill } : undefined}
            />
          )),
        )}
        {/* tegnes ovenpå, så rammen om den aktive række ikke dækker felterne */}
        {!finished && (
          <rect className="knit-demo-active" x={-3} y={active * CELL - 3} width={cols * CELL + 6} height={CELL + 6} rx={7} />
        )}
      </svg>
      <figcaption className="knit-demo-readout">
        <Speaker />
        <span className="knit-demo-text">
          {ALL_READOUTS.map((text) => (
            <span key={text} className="knit-demo-reserve">
              <Readout text={text} />
            </span>
          ))}
          <span>
            <Readout text={readoutText(done, total)} />
          </span>
        </span>
      </figcaption>
    </figure>
  )
}

// Lille gitter til "Sådan virker det": ' ' = udenfor skabelonen
function MiniGrid({ pattern, colored, active }) {
  const s = 18
  const rows = pattern.length
  const cols = pattern[0].length
  return (
    <svg viewBox={`-2 -2 ${cols * s + 4} ${rows * s + 4}`} className="mini-grid" aria-hidden="true">
      {active != null && <rect className="mini-grid-active" x={-2} y={active * s - 1} width={cols * s + 4} height={s + 2} rx={4} />}
      {pattern.map((row, r) =>
        [...row].map((key, c) => {
          const inside = key !== ' '
          return (
            <rect
              key={`${r}-${c}`}
              x={c * s + 1.5}
              y={r * s + 1.5}
              width={s - 3}
              height={s - 3}
              rx={3}
              className={inside ? 'mini-cell' : 'mini-cell outside'}
              style={inside && colored ? { fill: DEMO_COLORS[key].fill } : undefined}
            />
          )
        }),
      )}
      {/* skabelonens kant: kolonne 1–4 i alle rækker */}
      <rect x={s} y={0} width={4 * s} height={rows * s} rx={2} className="mini-outline" />
    </svg>
  )
}

const MINI = [' i..i ', ' .rr. ', ' rppr ', ' .rr. ', ' i..i ']

const STEPS = [
  {
    title: 'Skabelon',
    text: 'Tegn en kant rundt om de felter du vil strikke – præcis som cellekanter i et regneark.',
    art: <MiniGrid pattern={MINI} />,
  },
  {
    title: 'Mønster',
    text: 'Fyld felterne med farver. De farver du senest har brugt, ligger altid lige ved hånden.',
    art: <MiniGrid pattern={MINI} colored />,
  },
  {
    title: 'Strik',
    text: 'Rowby fremhæver én række ad gangen og viser farveskiftene: “5 blå, 3 hvid, 5 blå”.',
    art: <MiniGrid pattern={MINI} colored active={2} />,
  },
]

const FEATURES = [
  { icon: <Speaker />, title: 'Læser rækkerne op', text: 'Hold øjnene på strikketøjet – Rowby siger farverne højt på dansk.' },
  { icon: <Upload />, title: 'Gemmes på alle enheder', text: 'Tegn på computeren, strik med telefonen. Dine skabeloner følger din konto.' },
  { icon: <Image />, title: 'Mønster fra et billede', text: 'Hent farver fra et foto, eller gør et billede om til masker.' },
  { icon: <Download />, title: 'Del og eksportér', text: 'Gem som PNG, eller som en fil du kan importere igen.' },
]

export default function Landing({ onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)

  // <dialog> skal åbnes imperativt; showModal giver fokusfælde, Esc og baggrund gratis
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('input')?.focus()
  }, [open])

  const openLogin = (next) => {
    setMode(next)
    setOpen(true)
  }
  // close() udløser onClose, som også kører ved Esc
  const closeLogin = () => dialogRef.current?.close()

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <Logo width={26} height={26} /> Rowby
        </div>
        <button className="btn ghost small" onClick={() => openLogin('login')}>
          Log ind
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-text">
            <p className="landing-eyebrow">Til dig der strikker mønstre</p>
            <h1>
              Strik dit mønster – <em>række for række</em>
            </h1>
            <p className="landing-lead">
              Tegn din skabelon, fyld den med farver, og lad Rowby fortælle dig præcis hvor mange masker af hver farve
              der kommer i næste række. Du kan også få dem læst højt.
            </p>
            <button className="btn primary landing-hero-btn" onClick={() => openLogin('login')}>
              Log ind
            </button>
            <ul className="landing-checks">
              <li>
                <Check /> Gemmes automatisk
              </li>
              <li>
                <Check /> Virker på mobil og computer
              </li>
            </ul>
          </div>

          <div className="landing-hero-demo">
            <KnitDemo />
          </div>
        </section>

        <section className="landing-section">
          <h2 className="landing-h2">Fra idé til pind på tre trin</h2>
          <ol className="landing-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="landing-step">
                <div className="landing-step-art">{step.art}</div>
                <h3>
                  <span className="landing-step-num">{i + 1}</span> {step.title}
                </h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section">
          <h2 className="landing-h2">Lavet til strikkepinden, ikke skrivebordet</h2>
          <ul className="landing-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="landing-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-cta">
          <h2>Klar til at slå op?</h2>
          <p>Rowby er lige nu kun for inviterede. Har du fået en invitationskode, kan du oprette en konto med det samme.</p>
          <button className="btn landing-cta-btn" onClick={() => openLogin('register')}>
            Kom i gang
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <Logo /> Rowby · Lavet til strikkere
      </footer>

      {/* klik på selve <dialog> (uden for kortet) er et klik på baggrunden */}
      <dialog
        ref={dialogRef}
        className="login-dialog"
        aria-label={mode === 'register' ? 'Opret konto' : 'Log ind'}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && closeLogin()}
      >
        {/* monteres kun mens dialogen er åben, så felterne er tomme næste gang */}
        {open && (
          <div className="login-dialog-inner">
            <button type="button" className="login-dialog-close" aria-label="Luk" onClick={closeLogin}>
              ×
            </button>
            <Login onLoggedIn={onLoggedIn} mode={mode} onModeChange={setMode} />
          </div>
        )}
      </dialog>
    </div>
  )
}
