import { useState } from 'react'
import { Logo } from './Icons'
import { login, register } from '../api'
import { validateSignup } from '../signup'

const REGISTER_MESSAGES = {
  invalid: 'Brugernavn eller adgangskode er ugyldigt',
  invite: 'Forkert invitationskode',
  taken: 'Brugernavnet er optaget',
}

export default function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'register'

  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (signup) {
      const invalid = validateSignup({ username, password, repeat, inviteCode })
      if (invalid) return setError(invalid)
    } else if (!username || !password) return
    setBusy(true)
    setError('')
    try {
      if (signup) {
        const problem = await register(username, password, inviteCode)
        if (!problem) return onLoggedIn()
        setError(REGISTER_MESSAGES[problem])
      } else {
        if (await login(username, password)) return onLoggedIn()
        setError('Forkert brugernavn eller adgangskode')
      }
    } catch {
      setError('Kunne ikke kontakte serveren')
    }
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="hero-badge">
          <Logo /> Rowby
        </div>
        <div className="login-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!signup} onClick={() => switchMode('login')}>
            Log ind
          </button>
          <button type="button" role="tab" aria-selected={signup} onClick={() => switchMode('register')}>
            Opret konto
          </button>
        </div>
        <input
          className="input"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Brugernavn"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signup && (
          <>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Gentag adgangskode"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            <input
              className="input"
              autoComplete="off"
              placeholder="Invitationskode"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </>
        )}
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {signup ? 'Opret konto' : 'Log ind'}
        </button>
      </form>
    </div>
  )
}
