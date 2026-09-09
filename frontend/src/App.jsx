import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import DeptGate from './components/DeptGate'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import AdminDashboard from './pages/AdminDashboard'
import ProjectManagement from './pages/ProjectManagement'
import Approvals from './pages/Approvals'
import UserReport from './pages/UserReport'
import AllTasks from './pages/AllTasks'
import MyDashboard from './pages/MyDashboard'
import DailyTaskUpdate from './pages/DailyTaskUpdate'
import MyTaskHistory from './pages/MyTaskHistory'
import AdminTickets from './pages/AdminTickets'
import Uploads from './pages/Uploads'
import AdminSprints from './pages/AdminSprints'
import UserSprintBoard from './pages/UserSprintBoard'
import AdminTasks from './pages/AdminTasks'

function RootRedirect() {
  const { isAdmin, profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={isAdmin ? '/admin-dashboard' : '/my-dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/admin-dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute adminOnly><ProjectManagement /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute adminOnly><UserReport /></ProtectedRoute>} />

          {/* Admin tasks: a super admin's own directives to a department
              admin — both tiers reach this page, it just adapts (super
              admin assigns, department admin completes). */}
          <Route path="/admin-tasks" element={<ProtectedRoute adminOnly><AdminTasks /></ProtectedRoute>} />

          {/* Approvals: super admin only — reviewing self-registered
              department_admin / super_admin requests. Replaces the old
              Users tab entirely (requirement: remove Users tab). */}
          <Route path="/approvals" element={<ProtectedRoute superAdminOnly><Approvals /></ProtectedRoute>} />

          {/* Tasks/Tickets: department admin only — not the super admin
              (view-only elsewhere). Blockers has been retired entirely. */}
          <Route path="/tasks" element={<ProtectedRoute adminOnly><DeptGate allowSuperAdmin={false}><AllTasks /></DeptGate></ProtectedRoute>} />
          <Route path="/tickets" element={<ProtectedRoute adminOnly><DeptGate allowSuperAdmin={false}><AdminTickets /></DeptGate></ProtectedRoute>} />

          {/* Sprints: RPA/Data Science admins manage them; RPA/Data Science
              users get a read-and-drag board. BA and HR have neither. */}
          <Route path="/sprints" element={
            <ProtectedRoute adminOnly>
              <DeptGate allowSuperAdmin={false} allowDepartments={['RPA', 'Data Science']}><AdminSprints /></DeptGate>
            </ProtectedRoute>
          } />
          <Route path="/sprint-board" element={
            <ProtectedRoute>
              <DeptGate allowSuperAdmin={false} allowDepartments={['RPA', 'Data Science']}><UserSprintBoard /></DeptGate>
            </ProtectedRoute>
          } />

          {/* Uploads: every department admin and every general user — never
              the super admin. */}
          <Route path="/uploads" element={
            <ProtectedRoute>
              <DeptGate allowSuperAdmin={false}><Uploads /></DeptGate>
            </ProtectedRoute>
          } />

          <Route path="/my-dashboard" element={<ProtectedRoute><MyDashboard /></ProtectedRoute>} />
          <Route path="/daily-update" element={<ProtectedRoute><DailyTaskUpdate /></ProtectedRoute>} />
          <Route path="/my-history" element={<ProtectedRoute><MyTaskHistory /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
