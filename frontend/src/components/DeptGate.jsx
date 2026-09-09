import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Restricts a page to specific admin tiers and/or departments, on top of
 * whatever ProtectedRoute already enforced. Renders nothing but a redirect
 * when the current user doesn't qualify — used for tabs that only some
 * departments or roles get (e.g. RPA board is RPA-only; Tasks/Blockers/
 * Tickets are hidden from the super admin).
 *
 * allowSuperAdmin: does a super_admin see this page? default true.
 * allowDepartments: array of department names a department_admin/user must
 *   belong to. Omit to allow any department.
 */
export default function DeptGate({ children, allowSuperAdmin = true, allowDepartments = null }) {
  const { isSuperAdmin, profile } = useAuth()
  const fallback = isSuperAdmin ? '/admin-dashboard' : (profile?.role === 'user' ? '/my-dashboard' : '/admin-dashboard')

  if (isSuperAdmin) {
    return allowSuperAdmin ? children : <Navigate to={fallback} replace />
  }

  if (allowDepartments && !allowDepartments.includes(profile?.department?.name)) {
    return <Navigate to={fallback} replace />
  }

  return children
}
