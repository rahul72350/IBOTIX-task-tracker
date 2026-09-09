import { useEffect, useMemo, useState } from 'react'
import { api, API_BASE, getToken } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'
import Modal from '../components/Modal'

function initials(name = '') { return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() }
function statusPillClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'in progress' || s === 'not started') return 'active'
  if (s === 'on hold' || s === 'pending from client') return 'hold'
  if (s === 'completed') return 'completed'
  return 'active'
}
function deptTagClass(dept) {
  if (dept === 'Pre Sales BA' || dept === 'Post Sales BA') return 'presales'
  if (dept === 'Data Science') return 'postsales'
  return 'dev'
}
const ALL_TIME_FROM = '2000-01-01'
function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthStartStr() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function UserReport() {
  const { profile, isSuperAdmin } = useAuth()
  const showAttachments = !profile?.department?.is_hr_workflow && profile?.department?.name !== 'RPA' && profile?.department?.name !== 'Data Science'
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const [dateMode, setDateMode] = useState('all') // 'all' | 'range'
  const [fromDate, setFromDate] = useState(monthStartStr())
  const [toDate, setToDate] = useState(todayStr())

  const [assignments, setAssignments] = useState([])
  const [updates, setUpdates] = useState([])
  const [loadError, setLoadError] = useState('')
  const [viewing, setViewing] = useState(null)

  // Task log table filters (client-side, scoped to the currently loaded user + date range)
  const [logProjectId, setLogProjectId] = useState('')
  const [logProcessId, setLogProcessId] = useState('')
  const [logStatusId, setLogStatusId] = useState('')

  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (selectedId) loadUserData(selectedId) }, [selectedId, dateMode, fromDate, toDate])

  async function loadUsers() {
    setLoading(true)
    setLoadError('')
    try {
      const raw = await api.get('/api/users')
      // A department_admin's own list is already scoped to their one
      // department server-side. The super admin's is unscoped (every
      // department) — HR OPS TEAM / HR OPS aren't shown to them here,
      // same as everywhere else in the app.
      const data = isSuperAdmin ? raw.filter(u => !u.department?.is_hr_workflow) : raw
      setUsers(data)
      if (data.length) setSelectedId(data[0].id)
    } catch (err) {
      console.error('loadUsers failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserData(userId) {
    try {
      const effFrom = dateMode === 'all' ? ALL_TIME_FROM : fromDate
      const effTo = dateMode === 'all' ? todayStr() : toDate
      const [assigns, taskUpdates] = await Promise.all([
        api.get(`/api/assignments?user_id=${userId}`),
        api.get(`/api/task-updates?user_id=${userId}&from=${effFrom}&to=${effTo}`),
      ])
      setAssignments(assigns.filter(a => a.user_id === Number(userId)))
      setUpdates(taskUpdates)
      // Loading a different user (or date range) invalidates the old filter selections.
      setLogProjectId('')
      setLogProcessId('')
      setLogStatusId('')
    } catch (err) {
      setLoadError(err.message)
    }
  }

  const filteredUsers = users.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()))
  const selected = users.find(u => Number(u.id) === Number(selectedId))

  const projectCount = new Set(assignments.map(a => a.project_id)).size
  const processCount = assignments.length
  const taskCount = updates.length

  // Dropdown options for the Task log filters — built from whatever's
  // actually present in the loaded log, so a filter never offers a choice
  // that would return zero rows.
  const logProjectOptions = useMemo(() => {
    const map = new Map()
    updates.forEach(u => { if (u.projects) map.set(u.projects.id, u.projects.name) })
    return [...map.entries()]
  }, [updates])

  const logProcessOptions = useMemo(() => {
    const map = new Map()
    updates
      .filter(u => !logProjectId || Number(u.project_id) === Number(logProjectId))
      .forEach(u => { if (u.processes) map.set(u.process_id, u.processes.name) })
    return [...map.entries()]
  }, [updates, logProjectId])

  const logStatusOptions = useMemo(() => {
    const map = new Map()
    updates.forEach(u => { if (u.task_statuses) map.set(u.task_statuses.id, u.task_statuses.name) })
    return [...map.entries()]
  }, [updates])

  const filteredUpdates = useMemo(() => {
    return updates.filter(u =>
      (!logProjectId || Number(u.project_id) === Number(logProjectId)) &&
      (!logProcessId || Number(u.process_id) === Number(logProcessId)) &&
      (!logStatusId  || Number(u.status_id)  === Number(logStatusId))
    )
  }, [updates, logProjectId, logProcessId, logStatusId])

  const logFiltersActive = logProjectId || logProcessId || logStatusId

  function clearLogFilters() {
    setLogProjectId('')
    setLogProcessId('')
    setLogStatusId('')
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.reports}</div>
          <div>
            <h1>Reports</h1>
        </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadUsers} />

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

      <div className="layout">
        <div>
          <div className="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="plist">
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && filteredUsers.length === 0 && <div className="empty-state">No users found.</div>}
            {filteredUsers.map(u => (
              <button key={u.id} className={'plist-item' + (Number(u.id) === Number(selectedId) ? ' active' : '')} onClick={() => setSelectedId(u.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar-sm" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(u.full_name)}</div>
                  <div>
                    <div className="pname">{u.full_name}</div>
                    <div className="pclient">{u.designations?.name || '—'}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="empty-state">Select a user to see their report.</div>}
          {selected && (
            <>
              <div className="detail-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="avatar-lg">{initials(selected.full_name)}</div>
                  <div>
                    <h2 style={{ margin: '0 0 4px' }}>{selected.full_name}</h2>
                    <div className="meta">{selected.designations?.name || '—'} · <span className={`tag ${deptTagClass(selected.department?.name || selected.designations?.department)}`}>{selected.department?.name || selected.designations?.department}</span></div>
                  </div>
                </div>
              </div>

              <div className="stat-cluster" style={{ padding: '16px 22px 4px', justifyContent: 'flex-start', gap: 32 }}>
                <div className="stat" style={{ textAlign: 'left' }}><div className="n">{projectCount}</div><div className="l">Projects</div></div>
                <div className="stat" style={{ textAlign: 'left' }}><div className="n">{processCount}</div><div className="l">Sub-processes assigned</div></div>
                <div className="stat" style={{ textAlign: 'left' }}><div className="n">{taskCount}</div><div className="l">Tasks logged {dateMode === 'all' ? '(all time)' : 'in range'}</div></div>
              </div>

              <div className="proc-head">
                <h3>Assigned work</h3>
              </div>
              <table>
                <thead><tr><th>Process</th><th>Status</th></tr></thead>
                <tbody>
                  {assignments.length === 0 && <tr><td colSpan={2} className="empty-state">No processes assigned.</td></tr>}
                  {assignments.map((a, i) => (
                    <tr key={i}>
                      <td className="proc-cell"><div className="pname">{a.processes?.name}</div><div className="pproj">{a.projects?.name}</div></td>
                      <td><span className={`status-pill ${statusPillClass(a.processes?.task_statuses?.name)}`}>{a.processes?.task_statuses?.name}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="proc-head" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <h3>Task log {dateMode === 'all' ? '(all time)' : `(${fromDate} to ${toDate})`}</h3>
              </div>

              <div className="filter-bar" style={{ margin: '0 0 12px', padding: '10px 22px' }}>
                <div className="fgroup">
                  <label>Project</label>
                  <select value={logProjectId} onChange={e => { setLogProjectId(e.target.value); setLogProcessId('') }}>
                    <option value="">All projects</option>
                    {logProjectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label>Process</label>
                  <select value={logProcessId} onChange={e => setLogProcessId(e.target.value)}>
                    <option value="">All processes</option>
                    {logProcessOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label>Status</label>
                  <select value={logStatusId} onChange={e => setLogStatusId(e.target.value)}>
                    <option value="">All statuses</option>
                    {logStatusOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
                {logFiltersActive && (
                  <div className="fgroup" style={{ justifyContent: 'flex-end' }}>
                    <label>&nbsp;</label>
                    <button type="button" className="btn-ghost" onClick={clearLogFilters}>Clear filters</button>
                  </div>
                )}
              </div>

              <p style={{ padding: '0 22px', margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
                Showing {Math.min(filteredUpdates.length, 25)} of {filteredUpdates.length} matching {logFiltersActive ? `(${updates.length} total)` : 'entries'}
              </p>

              <table>
                <thead><tr><th>Process</th><th>Status</th><th>{showAttachments ? 'Remarks / file' : 'Remarks'}</th><th>Date</th></tr></thead>
                <tbody>
                  {filteredUpdates.length === 0 && <tr><td colSpan={4} className="empty-state">No tasks match these filters.</td></tr>}
                  {filteredUpdates.slice(0, 25).map(u => (
                    <tr key={u.id}>
                      <td className="proc-cell"><div className="pname">{u.processes?.name}</div><div className="pproj">{u.projects?.name}</div></td>
                      <td><span className={`status-pill ${statusPillClass(u.task_statuses?.name)}`}>{u.task_statuses?.name}</span></td>
                      <td>
                        {showAttachments ? (
                          (u.remarks || u.attachment_file_name) ? (
                            <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12.5 }} onClick={() => setViewing(u)}>
                              {u.attachment_file_name ? '📄 ' : '💬 '}
                              {u.remarks ? (u.remarks.length > 24 ? u.remarks.slice(0, 24) + '…' : u.remarks) : 'View attachment'}
                            </button>
                          ) : '—'
                        ) : (
                          u.remarks || '—'
                        )}
                      </td>
                      <td>{new Date(u.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {viewing && (
        <Modal title="Task update" subtitle={`${selected?.full_name} · ${new Date(viewing.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`} onClose={() => setViewing(null)}>
          <div className="field">
            <label>Project</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.projects?.name}</p>
          </div>
          <div className="field">
            <label>Process</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.processes?.name} <span style={{ color: 'var(--text-muted)' }}>({viewing.processes?.department})</span></p>
          </div>
          <div className="field">
            <label>Remarks</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{viewing.remarks || <span className="hint">No remarks were entered.</span>}</p>
          </div>
          <div className="field">
            <label>Attachment</label>
            {viewing.attachment_file_name ? (
              <button type="button" className="btn-ghost" onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/api/task-updates/${viewing.id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } })
                  if (!res.ok) throw new Error('Could not download this file.')
                  const blob = await res.blob()
                  window.open(window.URL.createObjectURL(blob), '_blank')
                } catch (err) { alert(err.message) }
              }}>
                📄 {viewing.attachment_file_name} ({viewing.attachment_size_kb} KB)
              </button>
            ) : <p className="hint" style={{ margin: 0 }}>No file was attached to this entry.</p>}
          </div>
        </Modal>
      )}
    </Layout>
  )
}