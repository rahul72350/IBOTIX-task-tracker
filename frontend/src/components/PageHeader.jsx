// Shared page header: icon + title + subtitle, with an optional action slot.
export default function PageHeader({ icon, title, subtitle, children }) {
  return (
    <div className="topbar">
      <div className="page-head">
        {icon && <div className="page-icon">{icon}</div>}
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="topbar-actions">{children}</div>}
    </div>
  )
}

// ---- Icon set used across the app ----
const s = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const Icons = {
  dashboard: <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  projects: <svg {...s}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>,
  users: <svg {...s}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="8.5" r="2.6" /><path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.3" /></svg>,
  assignments: <svg {...s}><path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" /><rect x="6" y="6" width="12" height="15" rx="1.5" /><path d="M9 11h6M9 15h4" /></svg>,
  reports: <svg {...s}><path d="M4 20V10M11 20V4M18 20v-6" /></svg>,
  analytics: <svg {...s}><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></svg>,
  clock: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  history: <svg {...s}><path d="M3 12a9 9 0 109-9 9 9 0 00-7.6 4.2" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>,
  chart: <svg {...s}><rect x="3" y="12" width="4" height="8" rx="1" /><rect x="10" y="7" width="4" height="13" rx="1" /><rect x="17" y="4" width="4" height="16" rx="1" /></svg>,
  pie: <svg {...s}><path d="M12 3v9h9a9 9 0 10-9-9z" /><path d="M21 12a9 9 0 01-9 9" /></svg>,
  trend: <svg {...s}><path d="M3 17l6-6 4 4 8-8" /></svg>,
  building: <svg {...s}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>,
  check: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>,
  alert: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>,
  team: <svg {...s}><circle cx="9" cy="8" r="3" /><path d="M3 19c0-3 2.7-5.5 6-5.5S15 16 15 19" /><circle cx="17" cy="8.5" r="2.4" /></svg>,
  calendar: <svg {...s}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  hourglass: <svg {...s}><path d="M7 3h10M7 21h10" /><path d="M8 3v3.5a4 4 0 004 4 4 4 0 004-4V3" /><path d="M8 21v-3.5a4 4 0 014-4 4 4 0 014 4V21" /></svg>,
  sprint: <svg {...s}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  blocker: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>,
  ticket: <svg {...s}><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 100 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a2 2 0 100-4V9z" /></svg>,
}
