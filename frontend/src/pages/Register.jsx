import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useTheme } from '../context/ThemeContext'

const LOGO_LIGHT = encodeURI('/images/Ibotix Final Black Logo full.svg')
const LOGO_DARK  = encodeURI('/images/Ibotix Final Logo full White.svg')

export default function Register() {
  const { isDark } = useTheme()
  const logoSrc = isDark ? LOGO_DARK : LOGO_LIGHT
  const navigate = useNavigate()

  const [departments, setDepartments] = useState([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState('')

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'user', department_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { message, pending }

  const [step, setStep] = useState('form') // 'form' | 'otp' | 'done'
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    api.get('/api/auth/register-options')
      .then(data => setDepartments(data.departments))
      .catch(err => setOptionsError(err.message))
      .finally(() => setLoadingOptions(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (form.role !== 'super_admin' && !form.department_id) {
      setError('Pick a department.')
      return
    }
    setLoading(true)
    try {
      const data = await api.post('/api/auth/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        department_id: form.role !== 'super_admin' ? Number(form.department_id) : undefined,
      })
      setResult(data)
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setOtpError('')
    setVerifying(true)
    try {
      await api.post('/api/auth/verify-email', { email: form.email, otp })
      setStep('done')
    } catch (err) {
      setOtpError(err.message)
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setOtpError('')
    setOtpInfo('')
    setResending(true)
    try {
      await api.post('/api/auth/resend-verification', { email: form.email })
      setOtpInfo('A new code is on its way — check your inbox.')
    } catch (err) {
      setOtpError(err.message)
    } finally {
      setResending(false)
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
            <h2>Create an account</h2>
            <p>General user accounts work right away. Admin access needs a quick sign-off.</p>
          </div>

          {optionsError && <div className="login-error">{optionsError}</div>}
          {step === 'form' && error && <div className="login-error">{error}</div>}

          {step === 'done' ? (
            <>
              <div
                className="login-error"
                style={{
                  background: result.pending ? 'var(--warning-bg, #fef3c7)' : 'var(--success-bg, #dcfce7)',
                  color: result.pending ? 'var(--warning, #92400e)' : 'var(--success, #15803d)',
                  borderColor: 'transparent',
                }}
              >
                Email verified. {result.pending
                  ? 'A super admin still needs to approve your admin access request before you can sign in.'
                  : 'You can sign in now.'}
              </div>
              <p className="login-help"><Link to="/login">Back to sign in</Link></p>
            </>
          ) : step === 'otp' ? (
            <form onSubmit={handleVerifyOtp}>
              <div
                className="login-error"
                style={{
                  background: result.pending ? 'var(--warning-bg, #fef3c7)' : 'var(--success-bg, #dcfce7)',
                  color: result.pending ? 'var(--warning, #92400e)' : 'var(--success, #15803d)',
                  borderColor: 'transparent',
                }}
              >
                {result.message}
              </div>
              {otpError && <div className="login-error">{otpError}</div>}
              {otpInfo && !otpError && (
                <div className="login-error" style={{ background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #15803d)', borderColor: 'transparent' }}>
                  {otpInfo}
                </div>
              )}
              <div className="field">
                <label>6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  style={{ width: '100%', letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15 }} disabled={verifying || otp.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify code'}
              </button>
              <p className="login-help">
                Didn't get it?{' '}
                <button type="button" onClick={handleResend} disabled={resending} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #14b8a6)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                  {resending ? 'Sending…' : 'Send it again'}
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Full name</label>
                <input type="text" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Ananya Verma" style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@ibotix.com" style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" style={{ width: '100%' }} />
              </div>

              <div className="field">
                <label>I'm registering as</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ width: '100%' }} disabled={loadingOptions}>
                  <option value="user">A general team member</option>
                  <option value="department_admin">A department admin (needs approval)</option>
                  <option value="super_admin">Super Admin (needs approval)</option>
                </select>
              </div>

              {form.role !== 'super_admin' && (
                <div className="field">
                  <label>Department</label>
                  <select required value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} style={{ width: '100%' }} disabled={loadingOptions}>
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 14px', fontSize: 15, marginTop: 8 }} disabled={loading || loadingOptions}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          )}

          {step === 'form' && (
            <p className="login-help">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
