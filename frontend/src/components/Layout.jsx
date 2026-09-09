import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close the drawer automatically whenever the route changes.
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <div className="app-shell">
      {/* Mobile-only top bar: just the hamburger button */}
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </div>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <main>{children}</main>
    </div>
  )
}