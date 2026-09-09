import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'
import { useChartColors } from '../lib/chartColors'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

function deptTagClass(dept) {
  if (dept === 'Pre Sales BA' || dept === 'Post Sales BA') return 'presales'
  if (dept === 'Data Science') return 'postsales'
  return 'dev'
}

function statusPillClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'on hold') return 'hold'
  if (s === 'completed') return 'completed'
  if (s === 'dropped') return 'dropped'
  return 'notstarted'
}

function initials(name = '') {
  return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { isSuperAdmin, profile } = useAuth()
  const C = useChartColors()
  const deptName = profile?.department?.name
  const isHr = !!profile?.department?.is_hr_workflow
  const showFiveCards = deptName === 'RPA' || deptName === 'Data Science'

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [departments, setDepartments] = useState([])
  const [priorities, setPriorities] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    setLoadError('')
    try {
      const [statsData, projectsData, usersData, recent, masters] = await Promise.all([
        api.get('/api/stats/admin-dashboard'),
        api.get('/api/projects'),
        api.get('/api/users'),
        api.get('/api/task-updates?limit=6'),
        api.get('/api/masters'),
      ])
      setKpis(statsData)
      setProjects(projectsData)
      setUsers(usersData)
      setActivity(recent)
      setDepartments(masters.departments || [])
      setPriorities(masters.priorities || [])
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const deptOptions = useMemo(() => ['All departments', ...departments.map(d => d.name)], [departments])
  const projectOptions = useMemo(() => ['All projects', ...projects.map(p => p.name)], [projects])
  // HR's headers aren't real projects — the super admin's cross-department
  // charts (status distribution, priority) exclude them the same way the
  // dashboard's project counts and overview table already do. A
  // department_admin's own charts are untouched (an HR admin's own view
  // is still scoped to just their own headers, as expected).
  const chartProjects = useMemo(
    () => isSuperAdmin ? projects.filter(p => !p.departments?.is_hr_workflow) : projects,
    [projects, isSuperAdmin]
  )
  const [statusDept, setStatusDept] = useState('All departments')
  const [statusProject, setStatusProject] = useState('All projects')
  const [workloadDept, setWorkloadDept] = useState('All departments')

  // ---------------------------------------------------------------------
  // Task Status Distribution — every process, grouped by its own status.
  // Department admins filter by PROJECT (they only ever see their own
  // department's data anyway); the super admin filters by DEPARTMENT
  // instead, since they're looking across all of them.
  // ---------------------------------------------------------------------
  const STATUS_COLORS = {
    'Not Started': C.neutral,
    'In Progress': C.accent,
    'Completed': C.success,
    'On Hold': C.warning,
    'Pending from Client': C.danger,
  }

  const taskStatusDistribution = useMemo(() => {
    let relevant
    if (isSuperAdmin) {
      const allProcs = chartProjects.flatMap(p => p.processes || [])
      relevant = allProcs.filter(pr => statusDept === 'All departments' || pr.department === statusDept)
    } else {
      const scopedProjects = statusProject === 'All projects' ? projects : projects.filter(p => p.name === statusProject)
      relevant = scopedProjects.flatMap(p => p.processes || [])
    }
    const map = {}
    relevant.forEach(pr => {
      const s = pr.task_statuses?.name || 'Not Started'
      map[s] = (map[s] || 0) + 1
    })
    return map
  }, [projects, chartProjects, statusDept, statusProject, isSuperAdmin])

  // ---------------------------------------------------------------------
  // Projects by Priority
  // ---------------------------------------------------------------------
  const priorityLabels = useMemo(
    () => priorities.length ? priorities.map(p => p.name) : ['Low', 'Medium', 'High'],
    [priorities]
  )
  const projectsByPriority = useMemo(() => {
    const map = {}
    priorityLabels.forEach(l => { map[l] = 0 })
    chartProjects.forEach(p => {
      const pr = p.priority || 'Medium'
      map[pr] = (map[pr] || 0) + 1
    })
    return map
  }, [chartProjects, priorityLabels])

  // ---------------------------------------------------------------------
  // Employee Workload
  // ---------------------------------------------------------------------
  const employeeWorkload = useMemo(() => {
    const deptByUser = new Map(users.map(u => [u.id, u.department?.name || u.designations?.department]))
    const allAssignments = projects.flatMap(p => (p.processes || []).flatMap(pr => pr.assignments || []))

    const map = new Map()
    allAssignments.forEach(a => {
      const dept = deptByUser.get(a.user_id)
      if (workloadDept !== 'All departments' && dept !== workloadDept) return
      const existing = map.get(a.user_id) || { name: a.profiles?.full_name || 'Unknown', count: 0 }
      existing.count += 1
      map.set(a.user_id, existing)
    })

    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  }, [projects, users, workloadDept])

  const baseTooltip = {
    backgroundColor: C.tooltipBg, titleColor: C.tooltipText, bodyColor: C.tooltipText,
    borderColor: C.tooltipBorder, borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: false,
  }

  const statusLabels = Object.keys(taskStatusDistribution)
  const statusDonutData = {
    labels: statusLabels,
    datasets: [{
      data: statusLabels.map(l => taskStatusDistribution[l]),
      backgroundColor: statusLabels.map(l => STATUS_COLORS[l] || C.neutral),
      borderWidth: 0, hoverOffset: 6,
    }],
  }
  const statusDonutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { color: C.axis, boxWidth: 10, padding: 14, font: { size: 12 } } },
      tooltip: { ...baseTooltip, callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } },
    },
  }

  const priorityBarData = {
    labels: priorityLabels,
    datasets: [{
      data: priorityLabels.map(l => projectsByPriority[l] || 0),
      backgroundColor: priorityLabels.map((_, i) => [C.success, C.warning, C.danger, C.accent, C.presales][i % 5]),
      borderRadius: 5, barThickness: 40,
    }],
  }
  const priorityBarOptions = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false }, ticks: { color: C.axis } },
      y: { beginAtZero: true, ticks: { color: C.axis, precision: 0 }, grid: { color: C.grid } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { ...baseTooltip, callbacks: { label: ctx => `${ctx.parsed.y} project${ctx.parsed.y === 1 ? '' : 's'}` } },
    },
  }

  const workloadBarData = {
    labels: employeeWorkload.map(e => e.name),
    datasets: [{ data: employeeWorkload.map(e => e.count), backgroundColor: C.accent, borderRadius: 5, barThickness: 18 }],
  }
  const workloadBarOptions = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    scales: {
      x: { beginAtZero: true, ticks: { color: C.axis, precision: 0 }, grid: { color: C.grid } },
      y: { grid: { display: false }, ticks: { color: C.axis } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { ...baseTooltip, callbacks: { label: ctx => `${ctx.parsed.x} process${ctx.parsed.x === 1 ? '' : 'es'} assigned` } },
    },
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.dashboard}</div>
          <div>
            <h1>Dashboard</h1>
            <p className="sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{isSuperAdmin ? ' · overview across all departments' : ` · ${deptName}`}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {!isSuperAdmin && <button className="btn-primary" onClick={() => navigate('/projects')}>{isHr ? '+ New header' : '+ New project'}</button>}
        </div>
      </div>

      <DataError error={loadError} onRetry={loadDashboard} />

      <div className="kpi-row">
        {isSuperAdmin && (
          <>
            <div className="kpi"><div className="label">Active projects</div><div className="value">{loading ? '—' : kpis.activeProjects}</div></div>
            <div className="kpi"><div className="label">Total projects</div><div className="value">{loading ? '—' : kpis.totalProjects}</div></div>
            <div className="kpi"><div className="label">Team members</div><div className="value">{loading ? '—' : kpis.teamMembers}</div></div>
          </>
        )}
        {!isSuperAdmin && showFiveCards && (
          <>
            <div className="kpi"><div className="label">Active projects</div><div className="value">{loading ? '—' : kpis.activeProjects}</div></div>
            <div className="kpi"><div className="label">Team members</div><div className="value">{loading ? '—' : kpis.teamMembers}</div></div>
            <div className="kpi"><div className="label">Today's updates</div><div className="value">{loading ? '—' : `${kpis.todaysUpdates} / ${kpis.totalUsers}`}</div></div>
            <div className="kpi"><div className="label">In progress</div><div className="value">{loading ? '—' : kpis.inProgressProcesses}</div></div>
            <div className="kpi"><div className="label">Completed</div><div className="value">{loading ? '—' : kpis.completedProcesses}</div></div>
          </>
        )}
        {!isSuperAdmin && !showFiveCards && (
          <>
            <div className="kpi"><div className="label">{isHr ? 'Active headers' : 'Active projects'}</div><div className="value">{loading ? '—' : kpis.activeProjects}</div></div>
            <div className="kpi"><div className="label">Team members</div><div className="value">{loading ? '—' : kpis.teamMembers}</div></div>
            <div className="kpi"><div className="label">Today's updates</div><div className="value">{loading ? '—' : `${kpis.todaysUpdates} / ${kpis.totalUsers}`}</div></div>
            <div className="kpi"><div className="label">{isHr ? 'Pending tasks' : 'Pending processes'}</div><div className="value warn">{loading ? '—' : kpis.pendingProcesses}</div></div>
          </>
        )}
      </div>

      <div className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>{isHr ? 'Headers' : 'Projects'}</h2>
            <button className="link" onClick={() => navigate('/projects')}>View all</button>
          </div>
          <table>
            <thead><tr><th>{isHr ? 'Header' : 'Project'}</th><th>Department</th><th>Status</th><th>Team</th></tr></thead>
            <tbody>
              {(isSuperAdmin ? kpis.projectsOverview : projects)?.length === 0 && !loading && (
                <tr><td colSpan={4} className="empty-state">{isHr ? 'No headers yet. Create one to get started.' : 'No projects yet. Create one to get started.'}</td></tr>
              )}
              {isSuperAdmin
                ? (kpis.projectsOverview || []).map(p => (
                    <tr key={p.id}>
                      <td><div className="proj-name">{p.name}</div></td>
                      <td><span className={`tag ${deptTagClass(p.department)}`}>{p.department}</span></td>
                      <td><span className={`status-pill ${statusPillClass(p.status?.name)}`}>{p.status?.name || '—'}</span></td>
                      <td>
                        <div className="avatars">
                          {(p.team || []).slice(0, 3).map((m, i) => (
                            <div key={i} className="avatar-sm" title={`${m.full_name} — ${m.department}`}>{initials(m.full_name)}</div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                : projects.map(p => {
                    const members = [...new Map((p.processes || []).flatMap(pr => (pr.assignments || []).map(a => [a.user_id, a.profiles])).filter(([, v]) => v)).values()]
                    return (
                      <tr key={p.id}>
                        <td><div className="proj-name">{p.name}</div><div className="proj-client">Client: {p.client_name}</div></td>
                        <td><span className={`tag ${deptTagClass(p.departments?.name)}`}>{p.departments?.name}</span></td>
                        <td><span className={`status-pill ${statusPillClass(p.project_statuses?.name)}`}>{p.project_statuses?.name || '—'}</span></td>
                        <td>
                          <div className="avatars">
                            {members.slice(0, 3).map(m => (
                              <div key={m.id} className="avatar-sm" title={`${m.full_name} — ${p.departments?.name}`}>{initials(m.full_name)}</div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Recent submissions</h2>
            <button className="link" onClick={() => navigate('/reports')}>View all</button>
          </div>
          <div className="feed">
            {activity.length === 0 && !loading && <div className="empty-state">No task updates logged yet.</div>}
            {activity.map((a, i) => (
              <div className="feed-item" key={i}>
                <div>
                  <div className="feed-text"><b>{a.profiles?.full_name}</b> logged <b>{a.task_statuses?.name}</b> — {a.processes?.name}</div>
                  <div className="feed-meta">{a.duration_hours} hrs</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-head" style={{ padding: '22px 2px 12px', border: 'none' }}>
        <h2>At a glance</h2>
      </div>

      <div className="chart-grid">
        <div className="panel">
          <div className="panel-head">
            <h3>Task status distribution</h3>
            {isSuperAdmin ? (
              <select value={statusDept} onChange={e => setStatusDept(e.target.value)}>
                {deptOptions.map(d => <option key={d}>{d}</option>)}
              </select>
            ) : (
              <select value={statusProject} onChange={e => setStatusProject(e.target.value)}>
                {projectOptions.map(p => <option key={p}>{p}</option>)}
              </select>
            )}
          </div>
          <div className="chart-card">
            {statusLabels.length === 0 ? <div className="chart-empty">No processes for this filter.</div> : (
              <div style={{ height: 260 }}><Doughnut data={statusDonutData} options={statusDonutOptions} /></div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Projects by priority</h3></div>
          <div className="chart-card">
            {chartProjects.length === 0 ? <div className="chart-empty">No projects yet.</div> : (
              <div style={{ height: 240 }}><Bar data={priorityBarData} options={priorityBarOptions} /></div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Employee workload</h3>
            <select value={workloadDept} onChange={e => setWorkloadDept(e.target.value)}>
              {deptOptions.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="chart-card">
            {employeeWorkload.length === 0 ? <div className="chart-empty">No assignments for this filter.</div> : (
              <div style={{ height: Math.max(200, employeeWorkload.length * 30) }}><Bar data={workloadBarData} options={workloadBarOptions} /></div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
