import { useEffect, useState } from 'react'
import { api, API_BASE, getToken } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

function formatSize(kb) {
  if (!kb) return '—'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function Uploads() {
  const { isAdmin, isActingAsUser } = useAuth()
  // When a department_admin has switched to User view, treat this page
  // exactly like a general user would see it — own uploads only.
  const effectiveAdmin = isAdmin && !isActingAsUser
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [userFilter, setUserFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => { loadAll() }, [userFilter, search])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const params = {}
      if (effectiveAdmin && userFilter) params.user_id = userFilter
      if (effectiveAdmin && search) params.search = search
      if (!effectiveAdmin) params.mine = '1'
      const [uploadList, userList] = await Promise.all([
        api.get('/api/uploads' + toQuery(params)),
        effectiveAdmin ? api.get('/api/users?active=1') : Promise.resolve([]),
      ])
      setRows(uploadList)
      setUsers(userList)
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toQuery(params) {
    const q = new URLSearchParams(params).toString()
    return q ? `?${q}` : ''
  }

  // The download endpoint needs the auth header, so a plain <a href> won't
  // work — fetch it ourselves and open the resulting (possibly redirected)
  // location in a new tab.
  async function handleDownload(id) {
    try {
      const res = await fetch(`${API_BASE}/api/task-updates/${id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Could not download this file.')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.assignments}</div>
          <div>
            <h1>{effectiveAdmin ? 'Uploads' : 'My uploads'}</h1>
            <p className="sub">{effectiveAdmin ? "Your department's latest uploaded files" : 'Files you\'ve attached to your daily updates'}</p>
          </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      {effectiveAdmin && (
        <div className="controls">
          <div className="controls-left">
            <div className="search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input type="text" placeholder="Search by file, remarks, or person..." style={{ width: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select value={userFilter} onChange={e => setUserFilter(e.target.value)}>
              <option value="">All people</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="panel">
        <table>
          <thead><tr><th>File</th>{effectiveAdmin && <th>Uploaded by</th>}<th>Project / process</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={effectiveAdmin ? 6 : 5} className="empty-state">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={effectiveAdmin ? 6 : 5} className="empty-state">No uploads yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>📄 {r.file_name}</td>
                {effectiveAdmin && <td>{r.uploaded_by?.full_name}</td>}
                <td className="proc-cell"><div className="pname">{r.process?.name}</div><div className="pproj">{r.project?.name}</div></td>
                <td>{formatSize(r.size_kb)}</td>
                <td>{new Date(r.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td><button className="btn-ghost" onClick={() => handleDownload(r.id)}>Download</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
