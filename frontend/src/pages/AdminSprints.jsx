import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
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
  return 'notstarted'
}

export default function AdminSprints() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [sprints, setSprints] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [taskStatuses, setTaskStatuses] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [board, setBoard] = useState([])
  const [backlog, setBacklog] = useState([])
  const [boardLoading, setBoardLoading] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dragFrom, setDragFrom] = useState(null) // 'board' | 'backlog'

  const [showNew, setShowNew] = useState(false)
  const [showAddBacklog, setShowAddBacklog] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [completeResult, setCompleteResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [loadError, setLoadError] = useState('')

  const [newSprint, setNewSprint] = useState({ project_id: '', name: '', goal: '', start_date: '', end_date: '' })
  const [newBacklogItem, setNewBacklogItem] = useState({ name: '', assignee: '', status_id: '', due_date: '' })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selectedId) loadBoard(selectedId) }, [selectedId])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [sprintList, projectList, userList, masters] = await Promise.all([
        api.get('/api/sprints'),
        api.get('/api/projects'),
        api.get('/api/users?active=1'),
        api.get('/api/masters'),
      ])
      setSprints(sprintList)
      setProjects(projectList)
      setUsers(userList)
      setTaskStatuses(masters.task_statuses || [])
      if (sprintList.length && !selectedId) setSelectedId(sprintList[0].id)
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Backlog is scoped to the selected sprint's own project — it's whatever
  // that project's processes don't currently belong to a sprint, plus
  // anything created directly with "+ Add to backlog" below.
  async function loadBoard(id) {
    setBoardLoading(true)
    try {
      const sprint = sprints.find(s => s.id === id)
      const [boardData, allProcesses] = await Promise.all([
        api.get(`/api/sprints/${id}/board`),
        api.get('/api/processes'),
      ])
      setBoard(boardData)
      if (sprint) {
        setBacklog(allProcesses.filter(p => p.project_id === sprint.project_id && !p.sprint_id))
      }
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setBoardLoading(false)
    }
  }

  const selected = sprints.find(s => Number(s.id) === Number(selectedId))
  const assignableUsers = useMemo(
    () => users.filter(u => !selected || u.department_id === selected.projects?.department_id),
    [users, selected]
  )

  const grouped = useMemo(() => {
    const map = new Map()
    taskStatuses.forEach(s => map.set(s.name, []))
    board.forEach(p => {
      const s = p.task_statuses?.name || 'Not Started'
      if (!map.has(s)) map.set(s, [])
      map.get(s).push(p)
    })
    return [...map.entries()]
  }, [board, taskStatuses])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    if (!newSprint.project_id || !newSprint.name || !newSprint.start_date || !newSprint.end_date) {
      setFormError('Project, name, and both dates are required.')
      return
    }
    setSaving(true)
    try {
      // Always created as "Planned" — a sprint never starts on its own,
      // you choose to start it explicitly from the board.
      const created = await api.post('/api/sprints', {
        project_id: Number(newSprint.project_id),
        name: newSprint.name,
        goal: newSprint.goal || null,
        start_date: newSprint.start_date,
        end_date: newSprint.end_date,
      })
      setShowNew(false)
      setNewSprint({ project_id: '', name: '', goal: '', start_date: '', end_date: '' })
      await loadAll()
      setSelectedId(created.id)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function startSprint() {
    try {
      await api.put(`/api/sprints/${selected.id}`, { status: 'Active' })
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function stopSprint() {
    // Pauses the sprint back to Planned — nothing moves or forwards, work
    // just isn't "in flight" anymore. Use Complete instead to wrap it up.
    try {
      await api.put(`/api/sprints/${selected.id}`, { status: 'Planned' })
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function handleCompleteNow() {
    setSaving(true)
    try {
      const result = await api.post(`/api/sprints/${selected.id}/close`, {})
      setCompleteResult(result)
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddBacklogItem(e) {
    e.preventDefault()
    setFormError('')
    if (!newBacklogItem.name || !newBacklogItem.assignee || !newBacklogItem.status_id) {
      setFormError('Name, assignee, and status are required.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/processes', {
        project_id: selected.project_id,
        name: newBacklogItem.name,
        assignee_id: Number(newBacklogItem.assignee),
        status_id: Number(newBacklogItem.status_id),
        due_date: newBacklogItem.due_date || null,
      })
      setShowAddBacklog(false)
      setNewBacklogItem({ name: '', assignee: '', status_id: '', due_date: '' })
      await loadBoard(selectedId)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function moveToStatus(processId, statusName) {
    const target = taskStatuses.find(s => s.name === statusName)
    if (!target) return
    try {
      await api.put(`/api/processes/${processId}`, { status_id: target.id })
      await loadBoard(selectedId)
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function addToSprintWithStatus(processId, statusName) {
    const target = taskStatuses.find(s => s.name === statusName)
    try {
      await api.put(`/api/processes/${processId}`, { sprint_id: selectedId, status_id: target?.id })
      await loadBoard(selectedId)
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function moveToBacklog(processId) {
    try {
      await api.put(`/api/processes/${processId}`, { clear_sprint: true })
      await loadBoard(selectedId)
    } catch (err) {
      setLoadError(err.message)
    }
  }

  function onDropColumn(statusName) {
    if (!dragId) return
    if (dragFrom === 'backlog') addToSprintWithStatus(dragId, statusName)
    else moveToStatus(dragId, statusName)
    setDragId(null)
    setDragFrom(null)
  }

  function onDropBacklog() {
    if (dragId && dragFrom === 'board') moveToBacklog(dragId)
    setDragId(null)
    setDragFrom(null)
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.sprint}</div>
          <div>
            <h1>Sprints</h1>
            <p className="sub">{profile?.department?.name}</p>
          </div>
        </div>
        <div className="btn-row">
          {selected && <button className="btn-ghost" onClick={() => setShowAddBacklog(true)}>+ Add to backlog</button>}
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New sprint</button>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="layout">
        <div>
          <div className="plist">
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && sprints.length === 0 && <div className="empty-state">No sprints yet. Create one to get started.</div>}
            {sprints.map(s => (
              <button key={s.id} className={'plist-item' + (Number(s.id) === Number(selectedId) ? ' active' : '')} onClick={() => setSelectedId(s.id)}>
                <div className="pname">{s.name}</div>
                <div className="pclient">{s.projects?.name} · <span className={`status-pill ${statusPillClass(s.status)}`} style={{ fontSize: 10 }}>{s.status}</span></div>
                <div className="prow">
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${s.total_processes ? Math.round((s.completed_processes / s.total_processes) * 100) : 0}%` }} /></div>
                  <span className="pct">{s.completed_processes}/{s.total_processes}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="empty-state">Select or create a sprint to see its board.</div>}
          {selected && (
            <>
              <div className="detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <div className="meta">
                    {selected.projects?.name} · {new Date(selected.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(selected.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {selected.goal ? ` · ${selected.goal}` : ''}
                  </div>
                </div>
                <div className="detail-actions">
                  <span className={`status-pill ${statusPillClass(selected.status)}`}>{selected.status}</span>
                  {selected.status === 'Planned' && <button className="btn-ghost" onClick={startSprint}>Start sprint</button>}
                  {selected.status === 'Active' && <button className="btn-ghost" onClick={stopSprint}>Stop sprint</button>}
                  {selected.status !== 'Completed' && <button className="btn-ghost" onClick={() => setShowCompleteConfirm(true)}>Complete sprint</button>}
                </div>
              </div>

              <div style={{ padding: '16px 22px 0', display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16 }}>
                {boardLoading ? <div className="empty-state">Loading board…</div> : (
                  <div className="kanban-board">
                    {grouped.map(([status, items]) => (
                      <div
                        key={status}
                        className="kanban-col"
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => onDropColumn(status)}
                      >
                        <div className="kanban-col-title">{status} ({items.length})</div>
                        {items.map(p => (
                          <div
                            key={p.id}
                            className="kanban-card"
                            draggable
                            onDragStart={() => { setDragId(p.id); setDragFrom('board') }}
                            style={{ cursor: 'grab' }}
                          >
                            <div className="kanban-card-title">{p.name}</div>
                            <div className="kanban-card-meta">
                              {p.assignments?.[0] && <span>{p.assignments[0].full_name}</span>}
                              {p.due_date && <span className="tag dev">Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                            </div>
                          </div>
                        ))}
                        {items.length === 0 && <div className="kanban-empty">Drop here</div>}
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="kanban-col"
                  onDragOver={e => e.preventDefault()}
                  onDrop={onDropBacklog}
                  style={{ background: 'var(--card)' }}
                >
                  <div className="kanban-col-title">Backlog ({backlog.length})</div>
                  {backlog.map(p => (
                    <div
                      key={p.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => { setDragId(p.id); setDragFrom('backlog') }}
                      style={{ cursor: 'grab' }}
                    >
                      <div className="kanban-card-title">{p.name}</div>
                    </div>
                  ))}
                  {backlog.length === 0 && <div className="kanban-empty">Backlog is empty</div>}
                </div>
              </div>
              <div style={{ height: 16 }} />
            </>
          )}
        </div>
      </div>

      {showNew && (
        <Modal title="New sprint" onClose={() => setShowNew(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>Project</label>
              <select required value={newSprint.project_id} onChange={e => setNewSprint({ ...newSprint, project_id: e.target.value })}>
                <option value="">Select...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Sprint name</label>
              <input type="text" placeholder="e.g. Sprint 4" required value={newSprint.name} onChange={e => setNewSprint({ ...newSprint, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start date</label>
                <input type="date" required value={newSprint.start_date} onChange={e => setNewSprint({ ...newSprint, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>End date</label>
                <input type="date" required value={newSprint.end_date} onChange={e => setNewSprint({ ...newSprint, end_date: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Goal</label>
              <textarea rows="2" placeholder="What should be done by the end of this sprint?" value={newSprint.goal} onChange={e => setNewSprint({ ...newSprint, goal: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create sprint'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddBacklog && selected && (
        <Modal title="Add to backlog" subtitle={`For: ${selected.projects?.name}`} onClose={() => setShowAddBacklog(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleAddBacklogItem}>
            <div className="field">
              <label>Name</label>
              <input type="text" placeholder="e.g. Fix invoice edge case" required value={newBacklogItem.name} onChange={e => setNewBacklogItem({ ...newBacklogItem, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Assign to</label>
                <select required value={newBacklogItem.assignee} onChange={e => setNewBacklogItem({ ...newBacklogItem, assignee: e.target.value })}>
                  <option value="">Select...</option>
                  {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select required value={newBacklogItem.status_id} onChange={e => setNewBacklogItem({ ...newBacklogItem, status_id: e.target.value })}>
                  <option value="">Select...</option>
                  {taskStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Due date <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={newBacklogItem.due_date} onChange={e => setNewBacklogItem({ ...newBacklogItem, due_date: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowAddBacklog(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add to backlog'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showCompleteConfirm && (
        <Modal title="Complete this sprint?" onClose={() => setShowCompleteConfirm(false)}>
          <p style={{ fontSize: 13.5 }}>
            Anything in this sprint that isn't Completed will move automatically to the next sprint for this project
            (whichever one starts soonest after this sprint ends), or back to the backlog if there isn't one yet.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowCompleteConfirm(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={async () => { await handleCompleteNow(); setShowCompleteConfirm(false) }}>
              {saving ? 'Completing…' : 'Complete sprint'}
            </button>
          </div>
        </Modal>
      )}

      {completeResult && (
        <Modal title="Sprint completed" onClose={() => setCompleteResult(null)}>
          <p style={{ fontSize: 13.5 }}>
            {completeResult.moved === 0
              ? 'Everything in this sprint was already Completed — nothing needed to move.'
              : `${completeResult.moved} unfinished process${completeResult.moved === 1 ? '' : 'es'} moved to ${completeResult.target === 'next_sprint' ? 'the next sprint.' : 'the backlog (no later sprint exists yet for this project).'}`}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={() => setCompleteResult(null)}>Done</button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
