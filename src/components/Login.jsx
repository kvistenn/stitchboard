import { useState } from 'react'
import { Yarn } from './Icons'
import { login } from '../api'

export default function Login({ onLoggedIn }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      if (await login(password)) {
        onLoggedIn()
        return
      }
      setError('Forkert adgangskode')
    } catch {
      setError('Kunne ikke kontakte serveren')
    }
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="hero-badge">
          <Yarn /> Stitchboard
        </div>
        <h1>Log ind</h1>
        <input
          className="input"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          Log ind
        </button>
      </form>
    </div>
  )
}
