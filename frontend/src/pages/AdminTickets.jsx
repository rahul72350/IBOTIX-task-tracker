import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { Icons } from '../components/PageHeader'
import DataError from '../components/DataError'
import Modal from '../components/Modal'

function statusPillClass(status) {
  if (status === 'Open') return 'hold'
  if (status === 'Accepted') return 'active'
  if (status === 'Rejected') return 'dropped'
  if (status === 'In Progress') return 'active'
  if (status === 'Completed') return 'completed'
  return 'notstarted'
}

export default function AdminTickets() {
  const { profile } = useAuth()
  const myDept = profile?.department?.name
  const myDeptId = profile?.department?.id

  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState([])
  const [departments, setDepartments] = useState([])
  const [priorities, setPriorities] = useState([])
  const [tab, setTab] = useState('all')
  const [loadError, setLoadError] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [decisionTicket, setDecisionTicket] = useState(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [newTicket, setNewTicket] = useState({ title: '', description: '', to_department_id: '', priority_id: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError('')
    try {
      const [ticketList, masters] = await Promise.all([
        api.get('/api/tickets'),
        api.get('/api/masters'),
      ])
      setTickets(ticketList)
      setDepartments(masters.departments || [])
      setPriorities(masters.priorities || [])
    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (tab === 'raised') return tickets.filter(t => t.from_department_id === myDeptId)
    if (tab === 'received') return tickets.filter(t => t.to_department_id === myDeptId)
    return tickets
  }, [tickets, tab, myDeptId])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    if (!newTicket.title || !newTicket.description || !newTicket.to_department_id) {
      setFormError('Title, description, and a target department are required.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/tickets', {
        title: newTicket.title,
        description: newTicket.description,
        to_department_id: Number(newTicket.to_department_id),
        priority_id: newTicket.priority_id ? Number(newTicket.priority_id) : undefined,
      })
      setShowNew(false)
      setNewTicket({ title: '', description: '', to_department_id: '', priority_id: '' })
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function openDecision(t) {
    setFormError('')
    setDecisionNotes('')
    setDecisionTicket(t)
  }

  async function handleDecision(status) {
    setFormError('')
    setSaving(true)
    try {
      await api.put(`/api/tickets/${decisionTicket.id}/decision`, { status, response_notes: decisionNotes || undefined })
      setDecisionTicket(null)
      await loadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Once Accepted, the receiving admin moves it straight to In Progress
  // or Completed themselves — no assigning it to one of their users.
  async function setStatus(t, status) {
    setLoadError('')
    try {
      await api.put(`/api/tickets/${t.id}/status`, { status })
      await loadAll()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <div className="page-head">
          <div className="page-icon">{Icons.ticket}</div>
          <div>
            <h1>Tickets</h1>
            <p className="sub">Raise a request to another department, or handle one sent to yours</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New ticket</button>
      </div>

      <DataError error={loadError} onRetry={loadAll} />

      <div className="config-tabs">
        <button className={`config-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`config-tab${tab === 'raised' ? ' active' : ''}`} onClick={() => setTab('raised')}>Raised by {myDept}</button>
        <button className={`config-tab${tab === 'received' ? ' active' : ''}`} onClick={() => setTab('received')}>Received by {myDept}</button>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Title</th><th>Description</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty-state">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="empty-state">No tickets here.</td></tr>}
            {filtered.map(t => (
              <tr key={t.id}>
                <td><div className="pname">{t.title}</div></td>
                <td className="remark-cell" style={{ maxWidth: 260 }}>{t.description}</td>
                <td>{t.from_department?.name || '—'}</td>
                <td><span className="tag dev">{t.to_department?.name}</span></td>
                <td><span className={`status-pill ${statusPillClass(t.status)}`}>{t.status}</span></td>
                <td>
                  <div className="btn-row">
                    {t.status === 'Open' && myDeptId && t.to_department_id === myDeptId && (
                      <button className="btn-ghost" onClick={() => openDecision(t)}>Accept / Reject</button>
                    )}
                    {t.status === 'Accepted' && myDeptId && t.to_department_id === myDeptId && (
                      <button className="btn-ghost" onClick={() => setStatus(t, 'In Progress')}>Mark in progress</button>
                    )}
                    {t.status === 'In Progress' && myDeptId && t.to_department_id === myDeptId && (
                      <button className="btn-primary sm" onClick={() => setStatus(t, 'Completed')}>Mark complete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <Modal title="New ticket" onClose={() => setShowNew(false)}>
          {formError && <div className="form-error">{formError}</div>}
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>Title</label>
              <input type="text" required value={newTicket.title} onChange={e => setNewTicket({ ...newTicket, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows="3" required placeholder="What do you need from them? Be specific — this is shown wherever the ticket appears."
                value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Send to</label>
                <select required value={newTicket.to_department_id} onChange={e => setNewTicket({ ...newTicket, to_department_id: e.target.value })}>
                  <option value="">Select...</option>
                  {departments.filter(d => d.name !== myDept).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={newTicket.priority_id} onChange={e => setNewTicket({ ...newTicket, priority_id: e.target.value })}>
                  <option value="">—</option>
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send ticket'}</button>
            </div>
          </form>
        </Modal>
      )}

      {decisionTicket && (
        <Modal title="Accept or reject this ticket" subtitle={decisionTicket.title} onClose={() => setDecisionTicket(null)}>
          {formError && <div className="form-error">{formError}</div>}
          <div className="field">
            <label>Description</label>
            <p style={{ margin: 0, fontSize: 13.5 }}>{decisionTicket.description}</p>
          </div>
          <div className="field">
            <label>Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea rows="2" value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => handleDecision('Rejected')}>Reject</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => handleDecision('Accepted')}>{saving ? 'Saving…' : 'Accept'}</button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
