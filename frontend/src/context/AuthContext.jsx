import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  // Only meaningful for a department_admin — lets them experience their
  // department's own general-user pages (My dashboard, Daily update, etc.)
  // without losing their admin permissions. Purely a UI convenience, not
  // a security boundary — a department_admin keeps full access either way,
  // this just decides which nav they see. Persisted so a refresh doesn't
  // silently kick them back to Admin view mid-task.
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tms_view_mode') || 'admin')

  function setViewModeAndPersist(mode) {
    localStorage.setItem('tms_view_mode', mode)
    setViewMode(mode)
  }

  useEffect(() => {
    let active = true

    async function init() {
      if (!getToken()) {
        if (active) { setProfile(null); setLoading(false) }
        return
      }
      try {
        const me = await api.get('/api/auth/me')
        if (active) { setProfile(me); setAuthError('') }
      } catch (err) {
        console.error('Session check failed:', err)
        if (err.status === 401 || err.status === 403) {
          clearToken()
          if (active) setProfile(null)
        } else if (active) {
          setAuthError(err.message)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    init()

    return () => { active = false }
  }, [])

  async function signIn(email, password) {
    try {
      const { token } = await api.post('/api/auth/login', { email, password })
      setToken(token)
      const me = await api.get('/api/auth/me')
      setProfile(me)
      setAuthError('')
      return { error: null }
    } catch (err) {
      clearToken()
      return { error: { message: err.message } }
    }
  }

  function signOut() {
    clearToken()
    setProfile(null)
    setViewModeAndPersist('admin')
  }

  const isDepartmentAdmin = profile?.role === 'department_admin'

  const value = {
    profile,
    session: profile ? { user: profile } : null,
    loading,
    authError,
    isAdmin: profile?.role === 'super_admin' || profile?.role === 'department_admin',
    isSuperAdmin: profile?.role === 'super_admin',
    isDepartmentAdmin,
    // True only when a department_admin has switched to User view — pages
    // that render differently for admins vs. users (e.g. Uploads) should
    // check this instead of isAdmin directly.
    isActingAsUser: isDepartmentAdmin && viewMode === 'user',
    viewMode: isDepartmentAdmin ? viewMode : 'admin',
    setViewMode: setViewModeAndPersist,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
