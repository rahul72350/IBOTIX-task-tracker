import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyTaskUpdate() {
  const { profile } = useAuth()
  const deptName = profile?.department?.name || profile?.designations?.department
  const isHr = !!profile?.department?.is_hr_workflow
  const isBA = !isHr && deptName !== 'RPA' && deptName !== 'Data Science'
  // Users log work with a status here — that's the whole interface. No
  // self-service "mark complete" shortcut: whatever status gets picked
  // is simply visible to the admin (Today's entries below, plus Reports
  // and the Tasks log), and it's the admin who decides when a process or
  // project is actually done, from the Projects page.
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [taskStatuses, setTaskStatuses] = useState([])
  const [todaysEntries, setTodaysEntries] = useState([])

  const [form, setForm] = useState({ date: todayStr(), project_id: '', process_id: '', status_id: '', duration_hours: '', remarks: '' })
  const [attachFile, setAttachFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { if (profile) loadAll() }, [profile])

  // An admin reassigning or updating a process happens outside this tab.
  // Refetch on focus/tab-visible covers switching back to this tab; the
  // interval covers someone just leaving it open and staring at it the
  // whole time, so the project/process pickers never sit on stale data.
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
      const [assigns, masters, entries] = await Promise.all([
        api.get('/api/assignments?mine=1'),
        api.get('/api/masters'),
        api.get(`/api/task-updates?mine=1&from=${todayStr()}&to=${todayStr()}`),
      ])
      setAssignments(assigns)
      setTaskStatuses(masters.task_statuses)
      setTodaysEntries(entries)
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // A completed process needs no further work logged against it, so it
  // drops out of the picker once done.
  const activeAssignments = useMemo(
    () => assignments.filter(a => a.processes?.task_statuses?.name !== 'Completed'),
    [assignments]
  )

  const projectOptions = useMemo(() => {
    const map = new Map()
    activeAssignments.forEach(a => { if (a.projects) map.set(a.projects.id, a.projects.name) })
    return [...map.entries()]
  }, [activeAssignments])

  const processOptions = useMemo(() => {
    if (!form.project_id) return []
    return activeAssignments.filter(a => Number(a.project_id) === Number(form.project_id)).map(a => a.processes)
  }, [activeAssignments, form.project_id])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.project_id || !form.process_id || !form.status_id || !form.duration_hours) {
      setError('Please fill in all required fields.')
      return
    }
    if (isBA && !form.remarks.trim()) {
      setError('Remarks are required.')
      return
    }
    setSaving(true)
    try {
      const created = await api.post('/api/task-updates', {
        project_id: Number(form.project_id),
        process_id: Number(form.process_id),
        entry_date: form.date,
        status_id: Number(form.status_id),
        duration_hours: Number(form.duration_hours),
        remarks: form.remarks || null,
      })

      // Attaching a file is optional and best-effort — if it fails, the
      // logged entry itself has already been saved successfully.
      if (attachFile) {
        try {
          const formData = new FormData()
          formData.append('file', attachFile)
          await api.upload(`/api/task-updates/${created.id}/attachment`, formData)
        } catch (attachErr) {
          console.error('Attachment upload failed:', attachErr)
          setError(`Entry logged, but the file didn't upload: ${attachErr.message}`)
        }
      }

      setForm({ date: todayStr(), project_id: '', process_id: '', status_id: '', duration_hours: '', remarks: '' })
      setAttachFile(null)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.clock}</div>
          <div>
            <h1>Daily update</h1>
        <p className="sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          <span className="dept-badge" style={{ marginLeft: 8 }}>{profile?.designations?.department || profile?.designations?.name}</span>
        </p>
          </div>
        </div>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="layout layout-daily">
        <div className="panel">
          <div className="panel-head" style={{ display: 'block' }}>
            <h2 style={{ marginBottom: 3 }}>New entry</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Pick your project, the rest narrows down automatically.</p>
          </div>

          {showToast && (
            <div className="toast">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
              Entry logged. You can add another for today any time.
            </div>
          )}
          {error && <div className="form-error" style={{ margin: '0 22px 18px' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ padding: '4px 22px 22px' }}>
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>

            <div className="field">
              <label>Project</label>
              <select required value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value, process_id: '' })}>
                <option value="">Select project...</option>
                {projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Process</label>
              <select required disabled={!form.project_id} value={form.process_id} onChange={e => setForm({ ...form, process_id: e.target.value })}>
                <option value="">{form.project_id ? 'Select process...' : 'Select a project first'}</option>
                {processOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Status</label>
              <select required value={form.status_id} onChange={e => setForm({ ...form, status_id: e.target.value })}>
                <option value="">Select...</option>
                {taskStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Hours</label>
              <input type="number" required min="0.5" step="0.5" placeholder="e.g. 2"
                value={form.duration_hours} onChange={e => setForm({ ...form, duration_hours: e.target.value })} />
            </div>

            <div className="field">
              <label>Remarks {isBA ? <span style={{ color: 'var(--danger)', fontWeight: 400 }}>(required)</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>}</label>
              <textarea rows="2" required={isBA} placeholder={isBA ? 'Describe what you did' : 'Only if something needs explaining, e.g. a blocker'}
                value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
            </div>

            <div className="field">
              <label>Attach a file <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional, max 15 MB)</span></label>
              <input type="file" onChange={e => setAttachFile(e.target.files?.[0] || null)} />
              {attachFile && <p className="hint">Selected: {attachFile.name} ({Math.round(attachFile.size / 1024)} KB)</p>}
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 16px', fontSize: 14.5 }} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit entry'}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-head" style={{ display: 'block' }}>
            <h2 style={{ marginBottom: 3 }}>Today's entries</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{assignments.length} processes assigned · logged so far</p>
          </div>
          <div className="entry-list">
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && todaysEntries.length === 0 && <div className="empty-state">No entries logged yet today.</div>}
            {todaysEntries.map(entry => {
              const statusName = taskStatuses.find(s => s.id === entry.status_id)?.name
              return (
                <div className="entry" key={entry.id}>
                  <div className={`entry-dot ${statusName === 'Completed' ? 'done' : 'progress'}`}></div>
                  <div>
                    <div className="entry-title">{entry.processes?.name}</div>
                    <div className="entry-meta">{entry.projects?.name} · {statusName} · {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Layout>
  )
}
