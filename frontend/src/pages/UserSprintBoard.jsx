import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

export default function UserSprintBoard() {
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [sprints, setSprints] = useState([])
  const [taskStatuses, setTaskStatuses] = useState([])
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [dragId, setDragId] = useState(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [assigns, sprintList, masters] = await Promise.all([
        api.get('/api/assignments?mine=1'),
        api.get('/api/sprints'),
        api.get('/api/masters'),
      ])
      setAssignments(assigns)
      setSprints(sprintList)
      setTaskStatuses(masters.task_statuses || [])
      const sprintIds = [...new Set(assigns.filter(a => a.processes?.sprint_id).map(a => a.processes.sprint_id))]
      if (sprintIds.length && !selectedSprintId) setSelectedSprintId(sprintIds[0])
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sprintTabs = useMemo(() => {
    const map = new Map()
    assignments.forEach(a => {
      const sid = a.processes?.sprint_id
      if (sid && !map.has(sid)) {
        const sprint = sprints.find(s => s.id === sid)
        map.set(sid, sprint?.name || `Sprint ${sid}`)
      }
    })
    return [...map.entries()]
  }, [assignments, sprints])

  const sprintWork = assignments.filter(a => a.processes?.sprint_id === Number(selectedSprintId))

  const grouped = useMemo(() => {
    const map = new Map()
    taskStatuses.forEach(s => map.set(s.name, []))
    sprintWork.forEach(a => {
      const s = a.processes?.task_statuses?.name || 'Not Started'
      if (!map.has(s)) map.set(s, [])
      map.get(s).push(a)
    })
    return [...map.entries()]
  }, [sprintWork, taskStatuses])

  // Dragging into a new column logs a real status update rather than
  // silently relabeling the card — same as everywhere else in the app,
  // logging a status IS setting the process's status.
  async function onDrop(statusName) {
    if (!dragId) return
    const target = taskStatuses.find(s => s.name === statusName)
    const assignment = sprintWork.find(a => a.process_id === dragId)
    if (!target || !assignment) { setDragId(null); return }
    if (assignment.processes?.task_statuses?.name === statusName) { setDragId(null); return }

    setMoving(true)
    try {
      await api.post('/api/task-updates', {
        project_id: assignment.project_id,
        process_id: dragId,
        status_id: target.id,
      })
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setMoving(false)
      setDragId(null)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.sprint}</div>
          <div>
            <h1>Sprint board</h1>
          </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      {!loading && sprintTabs.length === 0 && (
        <div className="panel"><div className="empty-state">You have no processes in a sprint right now.</div></div>
      )}

      {sprintTabs.length > 0 && (
        <>
          <div className="config-tabs">
            {sprintTabs.map(([id, label]) => (
              <button key={id} className={`config-tab${Number(selectedSprintId) === id ? ' active' : ''}`} onClick={() => setSelectedSprintId(id)}>{label}</button>
            ))}
          </div>

          <div className="kanban-board">
            {grouped.map(([status, items]) => (
              <div
                className="kanban-col"
                key={status}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onDrop(status)}
              >
                <div className="kanban-col-title">{status} ({items.length})</div>
                {items.map(a => (
                  <div
                    className="kanban-card"
                    key={a.process_id}
                    draggable={!moving}
                    onDragStart={() => setDragId(a.process_id)}
                    style={{ cursor: moving ? 'wait' : 'grab' }}
                  >
                    <div className="kanban-card-title">{a.processes?.name}</div>
                    <div className="kanban-card-meta">
                      <span>{a.projects?.name}</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="kanban-empty">Drop here</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
