import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'


export default function MyDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignedWork, setAssignedWork] = useState([])
  const [loggedProcessIdsToday, setLoggedProcessIdsToday] = useState(new Set())
  const [loggedProcessIdsEver, setLoggedProcessIdsEver] = useState(new Set())
  const [loadError, setLoadError] = useState('')

  useEffect(() => { if (profile) loadAll() }, [profile])

  // Assigned work changes on the admin's side (reassigning a task,
  // marking one complete elsewhere) without this tab knowing. Refetch on
  // focus/tab-visible covers switching back to this tab; the interval
  // covers the case where someone just leaves it open and staring at
  // it the whole time, so it never sits on stale data either way.
  useEffect(() => {
    function onFocus() { if (profile) loadAll() }
    function onVisible() { if (profile && document.visibilityState === 'visible') loadAll() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => { if (profile) loadAll() }, 20000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [profile])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [assigns, stats] = await Promise.all([
        api.get('/api/assignments?mine=1'),
        api.get('/api/stats/my-dashboard'),
      ])
      setAssignedWork(assigns)
      setLoggedProcessIdsToday(new Set(stats.loggedProcessIdsToday))
      setLoggedProcessIdsEver(new Set(stats.loggedProcessIdsEver))
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const activeWork = assignedWork.filter(a => a.processes?.task_statuses?.name !== 'Completed')
  // Coverage, not a daily nag — how many of everything ever assigned to
  // you has at least one log against it, so you (and whoever you report
  // to) have a straight answer for "how many have you actually reported on."
  const loggedCoverage = assignedWork.filter(a => loggedProcessIdsEver.has(a.process_id)).length

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.dashboard}</div>
          <div>
            <h1>Welcome back, {profile?.full_name?.split(' ')[0]}</h1>
          <p className="sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            <span className="dept-badge" style={{ marginLeft: 8 }}>{profile?.designations?.department || profile?.designations?.name}</span>
          </p>
        </div>
        </div>
        <button className="btn-primary" onClick={() => navigate('/daily-update')}>+ Log today's update</button>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="kpi-row kpi-row-2col">
        <div className="kpi">
          <div className="label">Active processes</div>
          <div className="value">{loading ? '—' : activeWork.length}</div>
          <div className="delta">Across {new Set(assignedWork.map(a => a.project_id)).size} projects</div>
        </div>
        <div className="kpi">
          <div className="label">Processes logged</div>
          <div className="value">{loading ? '—' : `${loggedCoverage} of ${assignedWork.length}`}</div>
          <div className="delta">Ever reported on, out of everything assigned to you</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>My assigned work</h2></div>
        <div>
          {loading && <div className="empty-state">Loading…</div>}
          {!loading && assignedWork.length === 0 && <div className="empty-state">No processes assigned to you yet — check with your Admin.</div>}
          {assignedWork.map(a => {
            const completed = a.processes?.task_statuses?.name === 'Completed'
            const loggedToday = loggedProcessIdsToday.has(a.process_id)
            return (
              <div className="work-item" key={a.process_id}>
                <div className="work-info">
                  <div className="pname">{a.processes?.name}</div>
                  <div className="pmeta">{a.projects?.name} · {a.processes?.department}</div>
                </div>
                <span className={`status-pill ${completed ? 'completed' : (loggedToday ? 'active' : 'hold')}`}>
                  {completed ? 'Completed' : (loggedToday ? 'Logged today' : 'Not logged today')}
                </span>
                {!completed && !loggedToday && <button className="btn-primary xs" onClick={() => navigate('/daily-update')}>Log update</button>}
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
