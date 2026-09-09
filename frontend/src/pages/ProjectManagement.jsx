import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'
import Modal from '../components/Modal'

function statusPillClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'in progress') return 'active'
  if (s === 'on hold' || s === 'pending from client') return 'hold'
  if (s === 'completed') return 'completed'
  if (s === 'dropped') return 'dropped'
  return 'notstarted'
}
function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function ProjectManagement() {
  const { isSuperAdmin, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const [projectStatuses, setProjectStatuses] = useState([])
  const [taskStatuses, setTaskStatuses] = useState([])
  const [priorities, setPriorities] = useState([])
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])

  const [showNewProject, setShowNewProject] = useState(false)
  const [showFindProject, setShowFindProject] = useState(false)
  const [findId, setFindId] = useState('')
  const [findResult, setFindResult] = useState(null)
  const [findError, setFindError] = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showAddProcess, setShowAddProcess] = useState(false)
  const [showEditProcess, setShowEditProcess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [completingProject, setCompletingProject] = useState(false)
  const [completeProjectError, setCompleteProjectError] = useState('')
  const [assignAgainProcess, setAssignAgainProcess] = useState(null)
  const [assignAgainUserId, setAssignAgainUserId] = useState('')
  const [assignAgainSaving, setAssignAgainSaving] = useState(false)
  const [assignAgainError, setAssignAgainError] = useState('')

  const [newProject, setNewProject] = useState({ name: '', client_name: '', category: 'Delivery', department_id: '', start_date: '', priority_id: '', status_id: '', description: '' })
  const [newHeader, setNewHeader] = useState({ title: '', task: '' }) // HR's simplified New header + first task
  const [editProject, setEditProject] = useState({ id: null, name: '', client_name: '', category: 'Delivery', start_date: '', priority_id: '', status_id: '', description: '' })
  const [newProcess, setNewProcess] = useState({ name: '', assignee: '', status_id: '', due_date: '' })
  const [editProcess, setEditProcess] = useState({ id: null, name: '', status_id: '', assignee: '', original_assignee: '', due_date: '' })

  useEffect(() => { loadAll() }, [])

  // The team list is only fetched once, on page load — if someone new
  // gets an account while this page has been open a while, they'd be
  // missing from every assignee dropdown until a full reload. Refetch
  // it fresh right before showing any of those dropdowns instead of
  // relying on the page having just loaded.
  async function refreshUsers() {
    try {
      setUsers(await api.get('/api/users?active=1'))
    } catch (err) {
      console.error('refreshUsers failed:', err)
    }
  }

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [proj, masters, userList] = await Promise.all([
        api.get('/api/projects'),
        api.get('/api/masters'),
        api.get('/api/users?active=1'),
      ])
      setProjects(proj)
      setProjectStatuses(masters.project_statuses)
      setTaskStatuses(masters.task_statuses)
      setPriorities(masters.priorities || [])
      setDepartments(masters.departments || [])
      setUsers(userList)
      if (proj.length && !selectedId) setSelectedId(proj[0].id)
      const defaultPriority = (masters.priorities || []).find(p => p.name === 'Medium') || (masters.priorities || [])[0]
      setNewProject(p => ({ ...p, priority_id: p.priority_id || (defaultPriority ? String(defaultPriority.id) : '') }))
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.client_name.toLowerCase().includes(search.toLowerCase())
  )
  const selected = projects.find(p => Number(p.id) === Number(selectedId))
  // Hiding the header's status pill is specific to RPA's dashboard preference.
  const hideStatusPill = profile?.department?.name === 'RPA'
  // HR's simplified header+task workflow — "Projects" become "Headers",
  // created with just a title + first task, no client/category/status
  // fields to fill in. Assignment happens after the fact via the recycle
  // (Assign again) action on each task, not up front.
  const isHr = !!profile?.department?.is_hr_workflow

  // Super admin's list can span every department, so it's paginated —
  // first 10 shown by default, "View all" pages through the rest.
  const PAGE_SIZE = 10
  const [showingAll, setShowingAll] = useState(false)
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visibleProjects = (isSuperAdmin && !showingAll)
    ? filtered.slice(0, PAGE_SIZE)
    : isSuperAdmin
      ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      : filtered

  async function handleFindProject(e) {
    e.preventDefault()
    setFindError('')
    setFindResult(null)
    if (!findId.trim()) { setFindError('Enter a Project ID.'); return }
    setFindLoading(true)
    try {
      const result = await api.get(`/api/projects/find/${findId.trim()}`)
      setFindResult(result)
    } catch (err) {
      setFindError(err.message)
    } finally {
      setFindLoading(false)
    }
  }

  async function handleLinkProject() {
    setFindError('')
    setLinking(true)
    try {
      const linked = await api.post('/api/projects/link', { project_id: findResult.id })
      setShowFindProject(false)
      setFindId('')
      setFindResult(null)
      await loadAll()
      setSelectedId(linked.id)
    } catch (err) {
      setFindError(err.message)
    } finally {
      setLinking(false)
    }
  }

  async function handleCreateProject(e) {
    e.preventDefault()
    setFormError('')
    if (!newProject.name || !newProject.client_name || !newProject.start_date) {
      setFormError('Please fill in all required fields.')
      return
    }
    if (isSuperAdmin && !newProject.department_id) {
      setFormError('Pick a department for this project.')
      return
    }
    setSaving(true)
    try {
      // No status to pick — every new project starts Active on the backend.
      const created = await api.post('/api/projects', {
        name: newProject.name,
        client_name: newProject.client_name,
        category: newProject.category,
        department_id: isSuperAdmin ? Number(newProject.department_id) : undefined,
        start_date: newProject.start_date,
        priority_id: newProject.priority_id ? Number(newProject.priority_id) : undefined,
        description: newProject.description || null,
      })
      setShowNewProject(false)
      setNewProject({ name: '', client_name: '', category: 'Delivery', department_id: '', start_date: '', priority_id: '', status_id: '', description: '' })
      await loadAll()
      setSelectedId(created.id)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // HR's two-field version of creating a project: a title and one task,
  // that's it — no client, category, priority, or status to pick. Client
  // name is stamped the same as the title (HR headers aren't really
  // client work), start date is today, and the header status defaults
  // to whatever this department's masters call "Active".
  async function handleCreateHeader(e) {
    e.preventDefault()
    setFormError('')
    if (!newHeader.title.trim() || !newHeader.task.trim()) {
      setFormError('Please fill in both fields.')
      return
    }
    setSaving(true)
    try {
      const activeStatus = projectStatuses.find(s => s.name === 'Active') || projectStatuses[0]
      const project = await api.post('/api/projects', {
        name: newHeader.title.trim(),
        client_name: newHeader.title.trim(),
        category: 'Product',
        start_date: todayStr(),
        status_id: activeStatus ? Number(activeStatus.id) : undefined,
      })
      await api.post('/api/processes', { project_id: project.id, name: newHeader.task.trim() })
      setShowNewProject(false)
      setNewHeader({ title: '', task: '' })
      await loadAll()
      setSelectedId(project.id)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddProcess(e) {
    e.preventDefault()
    setFormError('')
    if (!newProcess.name || (!isHr && !newProcess.assignee)) {
      setFormError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/processes', {
        project_id: selectedId,
        name: newProcess.name,
        // No status to pick — every new process starts In Progress on
        // the backend. HR tasks also start unassigned — assignment
        // happens afterward via the recycle (Assign again) button.
        assignee_id: isHr ? undefined : Number(newProcess.assignee),
        due_date: isHr ? undefined : (newProcess.due_date || null),
      })
      setShowAddProcess(false)
      setNewProcess({ name: '', assignee: '', status_id: '', due_date: '' })
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function openEditProject(p) {
    setFormError('')
    setEditProject({
      id: p.id,
      name: p.name,
      client_name: p.client_name,
      category: p.category || 'Delivery',
      start_date: p.start_date ? p.start_date.slice(0, 10) : '',
      priority_id: p.priority_id ? String(p.priority_id) : '',
      status_id: p.status_id || '',
      description: p.description || '',
    })
    setShowEditProject(true)
  }

  async function handleEditProject(e) {
    e.preventDefault()
    setFormError('')
    if (!editProject.name || !editProject.client_name || !editProject.start_date || !editProject.status_id) {
      setFormError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    try {
      await api.put(`/api/projects/${editProject.id}`, {
        name: editProject.name,
        client_name: editProject.client_name,
        category: editProject.category,
        start_date: editProject.start_date,
        priority_id: editProject.priority_id ? Number(editProject.priority_id) : undefined,
        status_id: Number(editProject.status_id),
        description: editProject.description || null,
      })
      setShowEditProject(false)
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Data Science-only: a dedicated one-click way to close out the whole
  // project, distinct from marking any one process complete. Every other
  // department admin can still set a project to Completed via the
  // general Edit Project status dropdown — this is Data Science's own
  // shortcut for it, enforced server-side too.
  async function handleCompleteProject(p) {
    setCompleteProjectError('')
    if (!window.confirm(`Mark "${p.name}" as complete? This closes out the whole project, not just one process.`)) return
    setCompletingProject(true)
    try {
      await api.post(`/api/projects/${p.id}/complete`)
      await loadAll()
    } catch (err) {
      setCompleteProjectError(err.message)
    } finally {
      setCompletingProject(false)
    }
  }

  // HR's "recycle" button: same task, handed to someone (again), in
  // place — no new row, nothing extra shows up in the process list. The
  // backend just moves the assignment and sets status to In Progress.
  function openAssignAgain(pr) {
    setAssignAgainError('')
    setAssignAgainUserId('')
    setAssignAgainProcess(pr)
    refreshUsers()
  }

  async function handleAssignAgain(e) {
    e.preventDefault()
    setAssignAgainError('')
    if (!assignAgainUserId) {
      setAssignAgainError('Pick who this goes to.')
      return
    }
    setAssignAgainSaving(true)
    try {
      await api.post(`/api/processes/${assignAgainProcess.id}/assign-again`, { assignee_id: Number(assignAgainUserId) })
      setAssignAgainProcess(null)
      await loadAll()
    } catch (err) {
      setAssignAgainError(err.message)
    } finally {
      setAssignAgainSaving(false)
    }
  }

  function openEditProcess(pr) {
    setFormError('')
    const currentAssignee = pr.assignments?.[0]?.user_id || ''
    setEditProcess({
      id: pr.id,
      name: pr.name,
      status_id: pr.status_id || '',
      assignee: currentAssignee ? String(currentAssignee) : '',
      original_assignee: currentAssignee ? String(currentAssignee) : '',
      due_date: pr.due_date ? pr.due_date.slice(0, 10) : '',
    })
    setShowEditProcess(true)
    refreshUsers()
  }

  async function handleEditProcess(e) {
    e.preventDefault()
    setFormError('')
    if (!editProcess.name || !editProcess.status_id || !editProcess.assignee) {
      setFormError('Please fill in all fields.')
      return
    }
    setSaving(true)
    try {
      await api.put(`/api/processes/${editProcess.id}`, {
        name: editProcess.name,
        status_id: Number(editProcess.status_id),
        due_date: editProcess.due_date || null,
      })
      if (String(editProcess.assignee) !== String(editProcess.original_assignee)) {
        await api.post('/api/assignments', {
          user_id: Number(editProcess.assignee),
          project_id: Number(selectedId),
          process_id: Number(editProcess.id),
        })
      }
      setShowEditProcess(false)
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // `users` (from GET /api/users) is already scoped server-side to the
  // viewer's own department — no further filtering needed here. This
  // used to also check `u.department_id === selected.department_id`,
  // but `selected.department_id` is the project's OWNING department,
  // not the viewer's. That broke assignment the moment a department
  // merely LINKED to someone else's project (e.g. RPA linking into a
  // Post Sales BA-owned project): every RPA user got filtered out
  // because the check compared them against Post Sales BA's id instead
  // of RPA's — the dropdown looked empty even though RPA had people.
  // A new process is always stamped with the CALLER's own department
  // (see create_process/_assert_project_access), so the assignee list
  // should be scoped the same way, not to whoever owns the project.
  const assignableUsers = users

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.projects}</div>
          <div>
            <h1>{isHr ? 'Headers' : 'Projects'}</h1>
          </div>
        </div>
        {!isSuperAdmin && (
          <div className="btn-row">
            {!isHr && <button className="btn-ghost" onClick={() => setShowFindProject(true)}>Find Project</button>}
            <button className="btn-primary" onClick={() => setShowNewProject(true)}>{isHr ? '+ New header' : '+ New project'}</button>
          </div>
        )}
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="layout">
        <div>
          <div className="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="plist">
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && filtered.length === 0 && <div className="empty-state">No projects found.</div>}
            {visibleProjects.map(p => (
              <button key={p.id} className={'plist-item' + (Number(p.id) === Number(selectedId) ? ' active' : '')} onClick={() => setSelectedId(p.id)}>
                <div className="prow" style={{ marginBottom: 3 }}>
                  <div className="pname">{p.name}</div>
                  <span className="pct">#{p.id}</span>
                </div>
                <div className="pclient">{p.client_name} · {p.processes?.length || 0} processes</div>
              </button>
            ))}
          </div>
          {isSuperAdmin && !loading && filtered.length > PAGE_SIZE && !showingAll && (
            <button className="link" style={{ marginTop: 8 }} onClick={() => { setShowingAll(true); setPage(1) }}>
              View all ({filtered.length}) →
            </button>
          )}
          {isSuperAdmin && showingAll && (
            <div className="btn-row" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
              <span className="hint" style={{ margin: 0 }}>Page {page} of {pageCount}</span>
              <button className="btn-ghost" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next ›</button>
            </div>
          )}
        </div>

        <div className="panel">
          {!selected && <div className="empty-state">Select or create a project to see its details.</div>}
          {selected && (
            <>
              {completeProjectError && <div className="form-error" style={{ margin: '0 0 14px' }}>{completeProjectError}</div>}
              <div className="detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <div className="meta">
                    {isHr ? (
                      <>Header ID: <b>{selected.id}</b> · {selected.departments?.name} · Started {new Date(selected.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                    ) : (
                      <>Project ID: <b>{selected.id}</b> · Client: <b>{selected.client_name}</b> · {selected.departments?.name} · {selected.category} · Started {new Date(selected.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Priority: <b>{selected.priority || '—'}</b></>
                    )}
                  </div>
                </div>
                <div className="detail-actions">
                  {!hideStatusPill && <span className={`status-pill ${statusPillClass(selected.project_statuses?.name)}`}>{selected.project_statuses?.name}</span>}
                  {!isSuperAdmin && <button className="btn-ghost" onClick={() => openEditProject(selected)}>Edit project</button>}
                  {/* Marking a project Completed is super admin only — no
                      department admin, of any department, sees this button
                      (enforced server-side too), and only while it isn't
                      Completed already. The one exception to "super admin is
                      view-only here" (see !isSuperAdmin checks around this
                      page) — this is the one action they're allowed. */}
                  {isSuperAdmin && selected.project_statuses?.name !== 'Completed' && (
                    <button className="btn-primary sm" disabled={completingProject} onClick={() => handleCompleteProject(selected)}>
                      {completingProject ? 'Marking complete…' : 'Mark project complete'}
                    </button>
                  )}
                </div>
              </div>
              <div className="proc-head">
                <h3>{isHr ? 'Tasks' : 'Processes'}</h3>
                {!isSuperAdmin && <button className="btn-primary sm" onClick={() => { setShowAddProcess(true); refreshUsers() }}>{isHr ? '+ Add task' : '+ Add process'}</button>}
              </div>
              <table>
                <thead><tr><th>{isHr ? 'Task' : 'Process'}</th><th>Assigned to</th><th>Status</th>{!isHr && <th>Due</th>}{!isSuperAdmin && <th></th>}</tr></thead>
                <tbody>
                  {(!selected.processes || selected.processes.length === 0) && (
                    <tr><td colSpan={isHr ? 4 : 5} className="empty-state">{isHr ? 'No tasks yet. Add the first one.' : 'No processes yet. Add the first one.'}</td></tr>
                  )}
                  {selected.processes?.map(pr => {
                    const assignee = pr.assignments?.[0]?.profiles
                    const dueSoon = pr.due_date && pr.task_statuses?.name !== 'Completed' &&
                      (new Date(pr.due_date) - new Date()) / 86400000 <= 2
                    return (
                      <tr key={pr.id} className={!assignee ? 'unassigned' : ''}>
                        <td>{pr.name}</td>
                        <td>
                          <div className="assignee">
                            {assignee && <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 10.5 }}>{initials(assignee.full_name)}</div>}
                            {assignee
                              ? (isSuperAdmin ? `${assignee.full_name} (${assignee.role})` : assignee.full_name)
                              : 'Unassigned'}
                          </div>
                        </td>
                        <td>{assignee
                          ? <span className={`status-pill ${statusPillClass(pr.task_statuses?.name)}`}>{pr.task_statuses?.name}</span>
                          : <span className="status-pill unassigned">Unassigned</span>}
                        </td>
                        {!isHr && (
                          <td>
                            {pr.due_date ? (
                              <span
                                title={assignee ? `Assigned to ${assignee.full_name} — due ${pr.due_date}` : `Due ${pr.due_date}`}
                                style={dueSoon ? { color: 'var(--danger)', fontWeight: 600, cursor: 'help' } : { cursor: 'help' }}
                              >
                                {new Date(pr.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                        {!isSuperAdmin && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {isHr && (
                                <button className="icon-btn" aria-label="Assign again" title="Assign or reassign this task to someone" onClick={() => openAssignAgain(pr)}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
                                </button>
                              )}
                              <button className="icon-btn" aria-label="Edit process" onClick={() => openEditProcess(pr)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {showFindProject && (
        <Modal title="Find Project" onClose={() => { setShowFindProject(false); setFindId(''); setFindResult(null); setFindError('') }}>
          {findError && <div className="form-error">{findError}</div>}
          <form onSubmit={handleFindProject}>
            <div className="field">
              <label>Project ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" min="1" placeholder="e.g. 4" required value={findId} onChange={e => setFindId(e.target.value)} style={{ flex: 1 }} />
                <button type="submit" className="btn-primary" disabled={findLoading}>{findLoading ? 'Searching…' : 'Search'}</button>
              </div>
            </div>
          </form>
          {findResult && (
            <div className="panel" style={{ marginTop: 12, padding: 16 }}>
              <div className="pname">{findResult.name}</div>
              <div className="meta" style={{ marginTop: 4 }}>
                Client: <b>{findResult.client_name}</b> · Owned by <b>{findResult.departments?.name}</b> · {findResult.category}
                {findResult.project_statuses?.name && <> · {findResult.project_statuses.name}</>}
              </div>
              {findResult.already_linked ? (
                <p className="hint" style={{ marginTop: 10 }}>Your department is already linked to this project.</p>
              ) : (
                <div className="modal-actions" style={{ marginTop: 14 }}>
                  <button type="button" className="btn-primary" disabled={linking} onClick={handleLinkProject}>
                    {linking ? 'Linking…' : 'Link to my department'}
                  </button>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {showNewProject && isHr && (
        <Modal title="New header" onClose={() => setShowNewProject(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleCreateHeader}>
            <div className="field">
              <label>Header / title</label>
              <input type="text" placeholder="e.g. New Hire Onboarding" required autoFocus
                value={newHeader.title} onChange={e => setNewHeader({ ...newHeader, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Task</label>
              <input type="text" placeholder="e.g. Collect ID documents" required
                value={newHeader.task} onChange={e => setNewHeader({ ...newHeader, task: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create header'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showNewProject && !isHr && (
        <Modal title="New project" onClose={() => setShowNewProject(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleCreateProject}>
            <div className="field">
              <label>Project name</label>
              <input type="text" placeholder="e.g. Wakefit — Order Sync" required
                value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Client name</label>
                <input type="text" placeholder="e.g. Wakefit" required
                  value={newProject.client_name} onChange={e => setNewProject({ ...newProject, client_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={newProject.category} onChange={e => setNewProject({ ...newProject, category: e.target.value })}>
                  <option value="Delivery">Delivery (client)</option>
                  <option value="Product">Product (internal)</option>
                </select>
              </div>
            </div>
            {isSuperAdmin && (
              <div className="field">
                <label>Department</label>
                <select required value={newProject.department_id} onChange={e => setNewProject({ ...newProject, department_id: e.target.value })}>
                  <option value="">Select...</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            <div className="field-row">
              <div className="field">
                <label>Start date</label>
                <input type="date" required
                  value={newProject.start_date} onChange={e => setNewProject({ ...newProject, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={newProject.priority_id} onChange={e => setNewProject({ ...newProject, priority_id: e.target.value })}>
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows="3" placeholder="Short note about the engagement"
                value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create project'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showEditProject && (
        <Modal title="Edit project" onClose={() => setShowEditProject(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleEditProject}>
            <div className="field">
              <label>Project name</label>
              <input type="text" required
                value={editProject.name} onChange={e => setEditProject({ ...editProject, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Client name</label>
                <input type="text" required
                  value={editProject.client_name} onChange={e => setEditProject({ ...editProject, client_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={editProject.category} onChange={e => setEditProject({ ...editProject, category: e.target.value })}>
                  <option value="Delivery">Delivery (client)</option>
                  <option value="Product">Product (internal)</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start date</label>
                <input type="date" required
                  value={editProject.start_date} onChange={e => setEditProject({ ...editProject, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={editProject.priority_id} onChange={e => setEditProject({ ...editProject, priority_id: e.target.value })}>
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Status</label>
              <select required value={editProject.status_id} onChange={e => setEditProject({ ...editProject, status_id: e.target.value })}>
                <option value="">Select...</option>
                {projectStatuses.filter(s => s.name !== 'Completed').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows="3" placeholder="Short note about the engagement"
                value={editProject.description} onChange={e => setEditProject({ ...editProject, description: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowEditProject(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddProcess && (
        <Modal title={isHr ? 'Add task' : 'Add process'} subtitle={`To: ${selected?.name || '—'} (${selected?.departments?.name})`} onClose={() => setShowAddProcess(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleAddProcess}>
            <div className="field">
              <label>{isHr ? 'Task name' : 'Process name'}</label>
              <input type="text" placeholder={isHr ? 'e.g. Collect ID documents' : 'e.g. Invoice reconciliation'} required autoFocus={isHr}
                value={newProcess.name} onChange={e => setNewProcess({ ...newProcess, name: e.target.value })} />
            </div>
            {!isHr && (
              <>
                <div className="field">
                  <label>Assign to</label>
                  <select required value={newProcess.assignee} onChange={e => setNewProcess({ ...newProcess, assignee: e.target.value })}>
                    <option value="">Select user...</option>
                    {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Due date <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input type="date" value={newProcess.due_date} onChange={e => setNewProcess({ ...newProcess, due_date: e.target.value })} />
                </div>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowAddProcess(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Adding…' : (isHr ? 'Add task' : 'Add process')}</button>
            </div>
          </form>
        </Modal>
      )}

      {assignAgainProcess && (
        <Modal title="Assign task" subtitle={assignAgainProcess.name} onClose={() => setAssignAgainProcess(null)}>
          {assignAgainError && <div className="form-error">{assignAgainError}</div>}
          <form onSubmit={handleAssignAgain}>
            <div className="field">
              <label>Assign to</label>
              <select required autoFocus value={assignAgainUserId} onChange={e => setAssignAgainUserId(e.target.value)}>
                <option value="">Select user...</option>
                {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setAssignAgainProcess(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={assignAgainSaving}>{assignAgainSaving ? 'Assigning…' : 'Assign'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showEditProcess && (
        <Modal title="Edit process" subtitle={`In: ${selected?.name || '—'}`} onClose={() => setShowEditProcess(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleEditProcess}>
            <div className="field">
              <label>Process name</label>
              <input type="text" required
                value={editProcess.name} onChange={e => setEditProcess({ ...editProcess, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Assigned to</label>
                <select required value={editProcess.assignee} onChange={e => setEditProcess({ ...editProcess, assignee: e.target.value })}>
                  <option value="">Select user...</option>
                  {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select required value={editProcess.status_id} onChange={e => setEditProcess({ ...editProcess, status_id: e.target.value })}>
                  <option value="">Select...</option>
                  {taskStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {!isHr && (
              <div className="field">
                <label>Due date <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input type="date" value={editProcess.due_date} onChange={e => setEditProcess({ ...editProcess, due_date: e.target.value })} />
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowEditProcess(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}
