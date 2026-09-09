import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

function statusPillClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'in progress' || s === 'not started') return 'active'
  if (s === 'on hold' || s === 'pending from client') return 'hold'
  if (s === 'completed') return 'completed'
  return 'active'
}
function daysAgoStr(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function dayLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = daysAgoStr(1)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' })
}

export default function MyTaskHistory() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [projects, setProjects] = useState([])
  const [taskStatuses, setTaskStatuses] = useState([])

  const [fromDate, setFromDate] = useState(daysAgoStr(6))
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [projectFilter, setProjectFilter] = useState('All projects')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [loadError, setLoadError] = useState('')

  useEffect(() => { if (profile) loadAll() }, [profile])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [updates, assigns, masters] = await Promise.all([
        api.get('/api/task-updates?mine=1'),
        api.get('/api/assignments?mine=1'),
        api.get('/api/masters'),
      ])
      setEntries(updates)
      const projMap = new Map()
      assigns.forEach(a => { if (a.projects) projMap.set(a.projects.id, a.projects.name) })
      setProjects([...projMap.values()])
      setTaskStatuses(masters.task_statuses)
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => entries.filter(e => {
    const inRange = e.entry_date >= fromDate && e.entry_date <= toDate
    const matchesProject = projectFilter === 'All projects' || e.projects?.name === projectFilter
    const matchesStatus = statusFilter === 'All status' || e.task_statuses?.name === statusFilter
    return inRange && matchesProject && matchesStatus
  }), [entries, fromDate, toDate, projectFilter, statusFilter])

  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach(e => {
      if (!map.has(e.entry_date)) map.set(e.entry_date, [])
      map.get(e.entry_date).push(e)
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const totalEntries = entries.length
  const distinctProjects = new Set(entries.map(e => e.projects?.name).filter(Boolean)).size

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.history}</div>
          <div>
            <h1>My task history</h1>
          <p className="sub">Every entry you've logged, grouped by day</p>
        </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="summary-row">
        <div className="summary-chip"><div className="n">{totalEntries}</div><div className="l">Total entries logged</div></div>
        <div className="summary-chip"><div className="n">{distinctProjects}</div><div className="l">Projects worked on</div></div>
      </div>

      <div className="controls">
        <div className="controls-left">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span className="date-sep">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option>All projects</option>
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option>All status</option>
            {taskStatuses.map(s => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="panel"><div className="empty-state">Loading…</div></div>}
      {!loading && grouped.length === 0 && <div className="panel"><div className="empty-state">No entries in this range.</div></div>}

      {grouped.map(([date, dayEntries]) => (
        <div className="day-group" key={date}>
          <div className="day-head">
            <div className="d">{dayLabel(date)} <span>· {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            <div className="total">{dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}</div>
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Process</th><th>Status</th><th>Remarks</th></tr></thead>
              <tbody>
                {dayEntries.map(e => (
                  <tr key={e.id}>
                    <td className="proc-cell"><div className="pname">{e.processes?.name}</div><div className="pproj">{e.projects?.name}</div></td>
                    <td><span className={`status-pill ${statusPillClass(e.task_statuses?.name)}`}>{e.task_statuses?.name}</span></td>
                    <td className="remark-cell">{e.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Layout>
  )
}
