import { useMemo, useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { Localizer } from '../core/Localizer'
import { Segmented } from '../components/Segmented'

/**
 * Sign-in / sign-up card shown before the app. Rendered outside the app context
 * (there is no account yet), so it keeps its own language choice.
 */
export function AuthPage({ auth, dictionaries }) {
  const [lang, setLang] = useState('vi')
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const l = useMemo(() => new Localizer(lang, dictionaries), [lang, dictionaries])
  const isRegister = mode === 'register'

  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
  })

  const submit = async (e) => {
    e.preventDefault()
    if (isRegister && form.password !== form.confirm) return setError(l.ui('auth.error.mismatch'))
    setBusy(true)
    setError('')
    try {
      await auth[mode](form.username.trim(), form.password)
    } catch (err) {
      const key = `auth.error.${err.code}`
      setError(l.ui(key) === key ? l.ui('auth.error.server_error') : l.ui(key)) // unknown code: generic message
      setBusy(false)
    }
  }

  return (
    <main className="auth" lang={lang}>
      <form className="auth__card card-stock" onSubmit={submit} noValidate>
        <header className="auth__head">
          <span className="brand__mark" aria-hidden="true" />
          <div className="auth__title">
            <h1>MLA-C01</h1>
            <p className="muted small">{l.ui('app.tagline')}</p>
          </div>
          <Segmented
            label={l.ui('settings.language')}
            value={lang}
            onChange={setLang}
            options={[{ value: 'vi', label: 'VI' }, { value: 'en', label: 'EN' }]}
          />
        </header>

        <Segmented
          label={l.ui('auth.mode')}
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError('')
          }}
          options={[
            { value: 'login', label: l.ui('auth.login') },
            { value: 'register', label: l.ui('auth.register') },
          ]}
        />
        <p className="muted small">{l.ui(isRegister ? 'auth.registerLead' : 'auth.loginLead')}</p>

        <label className="auth__field">
          <span>{l.ui('auth.username')}</span>
          <input name="username" autoComplete="username" required minLength={3} maxLength={32} autoFocus {...field('username')} />
          {isRegister && <small className="muted">{l.ui('auth.usernameHint')}</small>}
        </label>
        <label className="auth__field">
          <span>{l.ui('auth.password')}</span>
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? 8 : undefined}
            {...field('password')}
          />
          {isRegister && <small className="muted">{l.ui('auth.passwordHint')}</small>}
        </label>
        {isRegister && (
          <label className="auth__field">
            <span>{l.ui('auth.confirm')}</span>
            <input name="confirm" type="password" autoComplete="new-password" required {...field('confirm')} />
          </label>
        )}

        {error && <p className="auth__error" role="alert">{error}</p>}

        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !form.username || !form.password}>
          {isRegister ? <UserPlus size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
          {l.ui(isRegister ? 'auth.register' : 'auth.login')}
        </button>
      </form>
    </main>
  )
}
