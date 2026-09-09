import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useTheme } from '../context/ThemeContext'

const LOGO_LIGHT = encodeURI('/images/Ibotix Final Black Logo full.svg')
const LOGO_DARK  = encodeURI('/images/Ibotix Final Logo full White.svg')

export default function ForgotPassword() {
  const { isDark } = useTheme()
  const logoSrc = isDark ? LOGO_DARK : LOGO_LIGHT
  const navigate = useNavigate()

  const [step, setStep] = useState('email') // 'email' | 'otp' | 'password'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function handleSendCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setInfo("If that email is registered, we've sent a 6-digit code — it expires in 10 minutes.")
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/verify-reset-otp', { email, otp })
      setInfo('')
      setStep('password')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { email, otp, new_password: password })
      navigate('/login', { state: { resetSuccess: true } })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
          <img src={logoSrc} alt="Ibotix" className="login-logo login-logo-mobile" />

          <div className="login-heading">
            <h2>Reset your password</h2>
            <p>
              {step === 'email' && "Enter your email and we'll send you a code."}
              {step === 'otp' && 'Enter the 6-digit code we emailed you.'}
              {step === 'password' && 'Choose a new password.'}
            </p>
          </div>

          {error && <div className="login-error">{error}</div>}
          {info && !error && (
            <div className="login-error" style={{ background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #15803d)', borderColor: 'transparent' }}>
              {info}
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={handleSendCode}>
              <div className="field">
                <label>Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@ibotix.ai" style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15 }} disabled={loading}>
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <div className="field">
                <label>6-digit code</label>
                <input type="text" inputMode="numeric" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ width: '100%', letterSpacing: 4, fontSize: 20, textAlign: 'center' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15 }} disabled={loading || otp.length !== 6}>
                {loading ? 'Verifying…' : 'Verify code'}
              </button>
              <p className="login-help">
                Didn't get it?{' '}
                <button type="button" onClick={() => setStep('email')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #14b8a6)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                  Send it again
                </button>
              </p>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleResetPassword}>
              <div className="field">
                <label>New password</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter your new password" style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15 }} disabled={loading}>
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}

          <p className="login-help">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
