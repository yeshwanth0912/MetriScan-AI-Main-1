import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewInspection from './pages/NewInspection.jsx'
import InspectionDetail from './pages/InspectionDetail.jsx'
import History from './pages/History.jsx'
import RuleAdmin from './pages/RuleAdmin.jsx'

function Shell({ children }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const link = ({ isActive }) =>
    `px-2.5 py-1 rounded ${isActive ? 'bg-ink text-white' : 'text-ink hover:bg-paper'}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-rule bg-card">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center gap-4">
          <div className="font-bold tracking-tight">
            MetriScan<span className="text-muted font-normal"> · Legal Metrology inspection</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/" end className={link}>Dashboard</NavLink>
            <NavLink to="/inspections/new" className={link}>New inspection</NavLink>
            <NavLink to="/history" className={link}>History</NavLink>
            {user?.role === 'ADMIN' && <NavLink to="/rules" className={link}>Rules</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-2xs text-muted">
            <span>{user?.name} · {user?.role}</span>
            <button className="btn-ghost !py-1 !text-2xs"
              onClick={() => { signOut(); navigate('/login') }}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4">{children}</main>
    </div>
  )
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-6 text-muted">Loading your session…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles?.length && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Shell>{children}</Shell>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/inspections/new" element={<Protected><NewInspection /></Protected>} />
      <Route path="/inspections/:id" element={<Protected><InspectionDetail /></Protected>} />
      <Route path="/history" element={<Protected><History /></Protected>} />
      <Route path="/rules" element={<Protected roles={['ADMIN']}><RuleAdmin /></Protected>} />
      <Route path="*" element={<Protected><div className="panel p-4">That page does not exist.</div></Protected>} />
    </Routes>
  )
}
