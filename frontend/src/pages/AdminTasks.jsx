import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

function statusPillClass(status) {
  return status === 'Completed' ? 'completed' : 'active'
}

export default function AdminTasks() {
  const { isSuperAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [deptAdmins, setDeptAdmins] = useState([])
  const [loadError, setLoadError] = useState('')

  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [completingId, setCompletingId] = useState(null)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const requests = [api.get('/api/admin-tasks')]
      if (isSuperAdmin) requests.push(api.get('/api/users?active=1'))
      const [taskList, userList] = await Promise.all(requests)
      setTasks(taskList)
      if (userList) setDeptAdmins(userList.filter(u => u.role === 'department_admin'))
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    if (!title.trim() || !assignedTo) {
      setFormError('Pick a title and who this goes to.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/admin-tasks', { title: title.trim(), assigned_to: Number(assignedTo) })
      setTitle('')
      setAssignedTo('')
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete(id) {
    setLoadError('')
    setCompletingId(id)
    try {
      await api.put(`/api/admin-tasks/${id}/complete`)
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setCompletingId(null)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.check}</div>
          <div>
            <h1>Admin tasks</h1>
          </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      {isSuperAdmin && (
        <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleCreate} className="field-row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 2 }}>
              <label>Task title</label>
              <input type="text" placeholder="e.g. Review Q3 headcount plan" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Assign to</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Select department admin...</option>
                {deptAdmins.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.department?.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Assigning…' : '+ Assign task'}</button>
          </form>
        </div>
      )}

      <div className="panel">
        <table>
          <thead><tr><th>Title</th><th>{isSuperAdmin ? 'Assigned to' : 'Assigned by'}</th><th>Status</th><th>Created</th>{!isSuperAdmin && <th></th>}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty-state">Loading…</td></tr>}
            {!loading && tasks.length === 0 && (
              <tr><td colSpan={5} className="empty-state">{isSuperAdmin ? 'No tasks assigned yet.' : 'Nothing assigned to you right now.'}</td></tr>
            )}
            {tasks.map(t => (
              <tr key={t.id}>
                <td><div className="pname">{t.title}</div></td>
                <td>{isSuperAdmin ? `${t.assignee?.full_name} — ${t.assignee?.department?.name || '—'}` : (t.created_by?.full_name || '—')}</td>
                <td><span className={`status-pill ${statusPillClass(t.status)}`}>{t.status}</span></td>
                <td>{new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                {!isSuperAdmin && (
                  <td>
                    {t.status === 'In Progress' && (
                      <button className="btn-primary sm" disabled={completingId === t.id} onClick={() => handleComplete(t.id)}>
                        {completingId === t.id ? 'Saving…' : 'Mark complete'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
