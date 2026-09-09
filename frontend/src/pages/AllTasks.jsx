import { useEffect, useMemo, useState } from 'react'
import { api, API_BASE, getToken } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'
import Modal from '../components/Modal'

function statusPillClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'in progress' || s === 'not started') return 'active'
  if (s === 'on hold' || s === 'pending from client') return 'hold'
  if (s === 'completed') return 'completed'
  return 'active'
}
function initials(name = '') { return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() }

const ALL_TIME_FROM = '2000-01-01'
function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthStartStr() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function AllTasks() {
  const { profile } = useAuth()
  // RPA and Data Science admins see remarks-only here — no attachment
  // access from Tasks; that's what the Uploads tab is for. BA keeps the
  // full remarks+file click-through, unchanged.
  const showAttachments = !profile?.department?.is_hr_workflow && profile?.department?.name !== 'RPA' && profile?.department?.name !== 'Data Science'
  const [loading, setLoading] = useState(true)
  const [updates, setUpdates] = useState([])
  const [users, setUsers] = useState([])
  const [loadError, setLoadError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [viewing, setViewing] = useState(null)

  const [dateMode, setDateMode] = useState('all') // 'all' | 'range'
  const [fromDate, setFromDate] = useState(monthStartStr())
  const [toDate, setToDate] = useState(todayStr())

  // Filters — all client-side against whatever the date range loaded, same
  // pattern as the per-user Reports screen.
  const [userFilter, setUserFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [processFilter, setProcessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { loadUsers() }, [])
  useEffect(() => { loadUpdates() }, [dateMode, fromDate, toDate])

  async function loadUsers() {
    try {
      const list = await api.get('/api/users')
      setUsers(list)
    } catch (err) {
      console.error('loadUsers failed:', err)
    }
  }

  async function loadUpdates() {
    setLoading(true)
    setLoadError('')
    try {
      const effFrom = dateMode === 'all' ? ALL_TIME_FROM : fromDate
      const effTo = dateMode === 'all' ? todayStr() : toDate
      const data = await api.get(`/api/task-updates?from=${effFrom}&to=${effTo}`)
      setUpdates(data)
      // A new date range invalidates the old filter selections.
      setUserFilter('')
      setProjectFilter('')
      setProcessFilter('')
      setStatusFilter('')
    } catch (err) {
      console.error('loadUpdates failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const userOptions = useMemo(() => {
    const map = new Map()
    updates.forEach(u => { if (u.profiles) map.set(u.user_id, u.profiles.full_name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [updates])

  const projectOptions = useMemo(() => {
    const map = new Map()
    updates
      .filter(u => !userFilter || Number(u.user_id) === Number(userFilter))
      .forEach(u => { if (u.projects) map.set(u.projects.id, u.projects.name) })
    return [...map.entries()]
  }, [updates, userFilter])

  const processOptions = useMemo(() => {
    const map = new Map()
    updates
      .filter(u => !userFilter || Number(u.user_id) === Number(userFilter))
      .filter(u => !projectFilter || Number(u.project_id) === Number(projectFilter))
      .forEach(u => { if (u.processes) map.set(u.process_id, u.processes.name) })
    return [...map.entries()]
  }, [updates, userFilter, projectFilter])

  const statusOptions = useMemo(() => {
    const map = new Map()
    updates.forEach(u => { if (u.task_statuses) map.set(u.task_statuses.id, u.task_statuses.name) })
    return [...map.entries()]
  }, [updates])

  const filtered = useMemo(() => {
    return updates.filter(u =>
      (!userFilter    || Number(u.user_id)    === Number(userFilter)) &&
      (!projectFilter || Number(u.project_id) === Number(projectFilter)) &&
      (!processFilter || Number(u.process_id) === Number(processFilter)) &&
      (!statusFilter   || Number(u.status_id)  === Number(statusFilter))
    )
  }, [updates, userFilter, projectFilter, processFilter, statusFilter])

  const filtersActive = userFilter || projectFilter || processFilter || statusFilter

  function clearFilters() {
    setUserFilter('')
    setProjectFilter('')
    setProcessFilter('')
    setStatusFilter('')
  }

  // The download endpoint needs the auth header, so a plain <a href> won't
  // work — fetch it ourselves and open the result in a new tab.
  async function handleDownload(id) {
    try {
      const res = await fetch(`${API_BASE}/api/task-updates/${id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Could not download this file.')
      const blob = await res.blob()
      window.open(window.URL.createObjectURL(blob), '_blank')
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete this task entry logged by ${entry.profiles?.full_name}?`)) return
    setDeletingId(entry.id)
    try {
      await api.del(`/api/task-updates/${entry.id}`)
      await loadUpdates()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.history}</div>
          <div>
            <h1>Tasks</h1>
            <p className="sub">Every task logged by every user, in one place</p>
          </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadUpdates} />

      <div className="filter-bar">
        <div className="fgroup">
          <label>Date range</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={dateMode === 'all' ? 'btn-primary sm' : 'btn-ghost'} onClick={() => setDateMode('all')}>All time</button>
            <button type="button" className={dateMode === 'range' ? 'btn-primary sm' : 'btn-ghost'} onClick={() => setDateMode('range')}>Specific dates</button>
          </div>
        </div>
        {dateMode === 'range' && (
          <>
            <div className="fgroup">
              <label>From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div className="fgroup">
              <label>To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="filter-bar">
        <div className="fgroup">
          <label>User</label>
          <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setProjectFilter(''); setProcessFilter('') }}>
            <option value="">All users</option>
            {userOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label>Project</label>
          <select value={projectFilter} onChange={e => { setProjectFilter(e.target.value); setProcessFilter('') }}>
            <option value="">All projects</option>
            {projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label>Process</label>
          <select value={processFilter} onChange={e => setProcessFilter(e.target.value)}>
            <option value="">All processes</option>
            {processOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statusOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        {filtersActive && (
          <div className="fgroup" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <button type="button" className="btn-ghost" onClick={clearFilters}>Clear filters</button>
          </div>
        )}
      </div>

      <p style={{ padding: '0 2px', margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Showing {Math.min(filtered.length, 50)} of {filtered.length} matching {filtersActive ? `(${updates.length} total in range)` : 'entries'}
      </p>

      <div className="panel">
        <table>
          <thead><tr><th>User</th><th>Process</th><th>Status</th><th>{showAttachments ? 'Remarks / file' : 'Remarks'}</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty-state">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="empty-state">No task entries match these filters.</td></tr>}
            {!loading && filtered.slice(0, 50).map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 10.5 }}>{initials(u.profiles?.full_name)}</div>
                    {u.profiles?.full_name}
                  </div>
                </td>
                <td className="proc-cell"><div className="pname">{u.processes?.name}</div><div className="pproj">{u.projects?.name}</div></td>
                <td><span className={`status-pill ${statusPillClass(u.task_statuses?.name)}`}>{u.task_statuses?.name}</span></td>
                <td>
                  {showAttachments ? (
                    (u.remarks || u.attachment_file_name) ? (
                      <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12.5 }} onClick={() => setViewing(u)}>
                        {u.attachment_file_name ? '📄 ' : '💬 '}
                        {u.remarks ? (u.remarks.length > 28 ? u.remarks.slice(0, 28) + '…' : u.remarks) : 'View attachment'}
                      </button>
                    ) : '—'
                  ) : (
                    u.remarks || '—'
                  )}
                </td>
                <td>{new Date(u.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>
                  <button className="icon-btn danger" aria-label="Delete entry" disabled={deletingId === u.id} onClick={() => handleDelete(u)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title="Task update" subtitle={`${viewing.profiles?.full_name} · ${new Date(viewing.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`} onClose={() => setViewing(null)}>
          <div className="field">
            <label>Project</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.projects?.name}</p>
          </div>
          <div className="field">
            <label>Process</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.processes?.name} <span style={{ color: 'var(--text-muted)' }}>({viewing.processes?.department})</span></p>
          </div>
          <div className="field">
            <label>Status</label>
            <p style={{ margin: 0, fontSize: 13.5 }}><span className={`status-pill ${statusPillClass(viewing.task_statuses?.name)}`}>{viewing.task_statuses?.name}</span></p>
          </div>
          <div className="field">
            <label>Remarks</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.remarks || <span className="hint">No remarks were entered.</span>}</p>
          </div>
          <div className="field">
            <label>Attachment</label>
            {viewing.attachment_file_name ? (
              <button type="button" className="btn-ghost" onClick={() => handleDownload(viewing.id)}>
                📄 {viewing.attachment_file_name} ({viewing.attachment_size_kb} KB)
              </button>
            ) : <p className="hint" style={{ margin: 0 }}>No file was attached to this entry.</p>}
          </div>
        </Modal>
      )}
    </Layout>
  )
}
