import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { profile, loading, authError, isAdmin, isSuperAdmin } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  if (authError && !profile) {
    return (
      <div className="msg-page">
        <div className="msg-wrap">
          <div className="msg-alert">
            <h1>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z" /><path d="M12 8v5M12 16h.01" />
              </svg>
              Cannot reach the API server
            </h1>
            <p>{authError}</p>
          </div>
          <div className="msg-card">
            <div className="cap">How to fix</div>
            <ol>
              <li>Open a terminal in the <code>backend</code> folder</li>
              <li>Run <code>uvicorn app.main:app --reload</code></li>
              <li>You should see <code>Uvicorn running on http://0.0.0.0:8000</code></li>
              <li>Then reload this page</li>
            </ol>
            <button className="msg-btn" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />

  if (superAdminOnly && !isSuperAdmin) {
    return <Navigate to={isAdmin ? "/admin-dashboard" : "/my-dashboard"} replace />
  }
  if (adminOnly && !isAdmin) {
    return <Navigate to="/my-dashboard" replace />
  }

  return children
}
