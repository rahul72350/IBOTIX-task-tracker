import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

// Company logo swaps with the active theme, same as the sidebar.
const LOGO_LIGHT = encodeURI('/images/Ibotix Final Black Logo full.svg')
const LOGO_DARK  = encodeURI('/images/Ibotix Final Logo full White.svg')

export default function Login() {
  const { signIn } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const logoSrc = isDark ? LOGO_DARK : LOGO_LIGHT

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <img src={logoSrc} alt="Ibotix" className="login-logo" />

        <div className="login-copy">
          <h1>Every process,<br />one place to track it.</h1>
          <p>Log daily work in seconds, see exactly where every client project stands.</p>
        </div>

        <div className="login-foot">
          <span>Internal tool</span><span>v1.0</span>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-form-wrap">
          {/* Shown only on small screens, where the branding panel is hidden */}
          <img src={logoSrc} alt="Ibotix" className="login-logo login-logo-mobile" />

          <div className="login-heading">
            <h2>Sign in</h2>
          </div>

          {error && <div className="login-error">{error}</div>}
          {!error && location.state?.resetSuccess && (
            <div className="login-error" style={{ background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #15803d)', borderColor: 'transparent' }}>
              Password reset — sign in with your new one.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@ibotix.com" style={{ width: '100%' }}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                  style={{ width: '100%' }}
                />
                <button type="button" onClick={() => setShowPw(s => !s)} className="login-show-btn">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <Link to="/forgot-password" style={{ fontSize: 12.5 }}>Forgot password?</Link>
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15 }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="login-help">
            Need access? <Link to="/register">Create an account</Link>.
          </p>
        </div>
      </main>
    </div>
  )
}