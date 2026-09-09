import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from './ThemeToggle'

const dashboard = { to: '/admin-dashboard', label: 'Dashboard', icon: <rect x="3" y="3" width="7" height="9" rx="1.5"/> }
const reports = { to: '/reports', label: 'Reports', icon: <path d="M4 20V10M11 20V4M18 20v-6"/> }
const tasks = { to: '/tasks', label: 'Tasks', icon: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></> }
const tickets = { to: '/tickets', label: 'Tickets', icon: <><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 100 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a2 2 0 100-4V9z"/></> }
const uploads = { to: '/uploads', label: 'Uploads', icon: <><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></> }
const sprints = { to: '/sprints', label: 'Sprints', icon: <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></> }
const approvals = { to: '/approvals', label: 'Approvals', icon: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></> }
const adminTasks = { to: '/admin-tasks', label: 'Admin tasks', icon: <><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></> }

const myDashboard = { to: '/my-dashboard', label: 'My dashboard', icon: <rect x="3" y="3" width="7" height="9" rx="1.5"/> }
const dailyUpdate = { to: '/daily-update', label: 'Daily update', icon: <circle cx="12" cy="12" r="9"/> }
const myUploads = { to: '/uploads', label: 'My uploads', icon: <><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></> }
const myHistory = { to: '/my-history', label: 'My task history', icon: <rect x="6" y="6" width="12" height="15" rx="1.5"/> }
const sprintBoard = { to: '/sprint-board', label: 'Sprint board', icon: <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></> }

// Your two logo files live in client/public/images/ — filenames kept exactly
// as you created them (encodeURI handles the spaces safely in the URL).
const LOGO_LIGHT = encodeURI('/images/Ibotix Final Black Logo full.svg')
const LOGO_DARK  = encodeURI('/images/Ibotix Final Logo full White.svg')

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function roleLabel(profile, isSuperAdmin, isDepartmentAdmin, viewMode) {
  if (isSuperAdmin) return 'Super Admin'
  if (isDepartmentAdmin) {
    const base = `${profile?.department?.name || 'Department'} Admin`
    return viewMode === 'user' ? `${base} (User view)` : base
  }
  return profile?.designations?.name || 'User'
}

// "Projects" is labeled "Headers" for HR's simpler header+task model —
// same underlying page, just the vocabulary that fits how HR works.
function projectsItem(isHr) {
  return {
    to: '/projects',
    label: isHr ? 'Headers' : 'Projects',
    icon: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>,
  }
}

// The general-user nav for one department — shared by real general users
// and by a department_admin who's switched to User view, so both see
// exactly the same thing.
function userNavFor(deptName) {
  const base = [myDashboard, dailyUpdate]
  if (deptName === 'RPA' || deptName === 'Data Science') base.push(sprintBoard)
  base.push(myUploads, myHistory)
  return base
}

// Nav is a function of role, department, AND (for a department_admin)
// which view they've switched to. Users and Blockers tabs are gone
// entirely — user management now happens via self-registration +
// Approvals (super admin only), and Blockers has been retired.
function buildNav({ isSuperAdmin, isDepartmentAdmin, deptName, isHr, viewMode }) {
  if (isSuperAdmin) {
    // View-only on Dashboard/Projects/Reports, plus Approvals (admin
    // access requests) — no Users tab at all now (that's requirement
    // #12: self-registration + Approvals replaces admin-driven user
    // management), and no Configure any more (Task Types and Configure
    // both retired together).
    return [dashboard, projectsItem(false), reports, adminTasks, approvals]
  }

  if (isDepartmentAdmin) {
    if (viewMode === 'user') return userNavFor(deptName)
    const base = [dashboard, projectsItem(isHr), reports, tasks, tickets, uploads, adminTasks]
    if (deptName === 'RPA') return [...base, sprints]
    if (deptName === 'Data Science') return [...base, sprints]
    return base
  }

  // General user
  return userNavFor(deptName)
}

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const { profile, isAdmin, isSuperAdmin, isDepartmentAdmin, viewMode, setViewMode, signOut } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const deptName = profile?.department?.name
  const isHr = !!profile?.department?.is_hr_workflow
  const items = buildNav({ isSuperAdmin, isDepartmentAdmin, deptName, isHr, viewMode })
  const logoSrc = isDark ? LOGO_DARK : LOGO_LIGHT

  async function handleLogout() {
    onClose()
    await signOut()
    navigate('/login')
  }

  function handleSwitchView() {
    const next = viewMode === 'admin' ? 'user' : 'admin'
    setViewMode(next)
    onClose()
    navigate(next === 'user' ? '/my-dashboard' : '/admin-dashboard')
  }

  return (
    <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
      <div className="wordmark">
        {/* key forces a fresh <img> element on every theme flip, so a
            cached/broken previous load can never linger on screen */}
        <img key={logoSrc} src={logoSrc} alt="Ibotix" className="logo-img" />
      </div>
      <nav>
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {item.icon}
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {isDepartmentAdmin && (
        <button className="view-switch-btn" onClick={handleSwitchView} title="Toggle between managing your department and working as a regular team member">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
          {viewMode === 'user' ? 'Switch to Admin view' : 'Switch to User view'}
        </button>
      )}

      <div className="sidebar-foot">
        <div className="avatar-sm">{initials(profile?.full_name)}</div>
        <div>
          <div className="who">{profile?.full_name || '...'}</div>
          <div className="role">{roleLabel(profile, isSuperAdmin, isDepartmentAdmin, viewMode)}</div>
        </div>
      </div>
      <div className="sidebar-links">
        <ThemeToggle />
        <button onClick={handleLogout}>Log out</button>
      </div>
    </aside>
  )
}
