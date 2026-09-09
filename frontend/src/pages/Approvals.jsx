import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

function roleLabel(role) {
  return role === 'super_admin' ? 'Super Admin' : 'Department Admin'
}

export default function Approvals() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [actionId, setActionId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const list = await api.get('/api/users/pending-admins')
      setRequests(list)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(req) {
    setActionId(req.id)
    setError('')
    try {
      await api.post(`/api/users/${req.id}/approve`)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(req) {
    if (!window.confirm(`Reject ${req.full_name}'s request${req.department_name ? ` for ${req.department_name}` : ''}? This deletes their pending account.`)) return
    setActionId(req.id)
    setError('')
    try {
      await api.post(`/api/users/${req.id}/reject`)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionId(null)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.users}</div>
          <div>
            <h1>Approvals</h1>
            <p className="sub">Self-registered admin access requests waiting for your sign-off</p>
          </div>
        </div>
      </div>

      <DataError error={error} onRetry={loadAll} />

      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Requesting</th><th>Department</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty-state">Loading…</td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={6} className="empty-state">No pending requests right now.</td></tr>}
            {requests.map(req => (
              <tr key={req.id}>
                <td>{req.full_name}</td>
                <td>{req.email}</td>
                <td><span className="status-pill hold">{roleLabel(req.role)}</span></td>
                <td>
                  {req.department_name || <span style={{ color: 'var(--text-muted)' }}>— (org-wide)</span>}
                  {req.department_already_has_admin && (
                    <span className="status-pill hold" style={{ marginLeft: 8 }} title="This department already has an active admin">Already has an admin</span>
                  )}
                </td>
                <td>{new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>
                  <div className="btn-row">
                    <button className="btn-ghost" disabled={actionId === req.id} onClick={() => handleReject(req)}>Reject</button>
                    <button className="btn-primary sm" disabled={actionId === req.id} onClick={() => handleApprove(req)}>
                      {actionId === req.id ? 'Working…' : 'Approve'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
