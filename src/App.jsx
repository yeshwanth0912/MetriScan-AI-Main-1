import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  PlusCircle,
  Clock,
  BookOpenCheck,
  LogOut,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { useAuth } from './auth.jsx'
import { GradientBackground } from './components/ui/oceanic-shimmer.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewInspection from './pages/NewInspection.jsx'
import InspectionDetail from './pages/InspectionDetail.jsx'
import History from './pages/History.jsx'
import RuleAdmin from './pages/RuleAdmin.jsx'

function Shell({ children }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const linkClasses = ({ isActive }) =>
    `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
      isActive
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen relative flex flex-col bg-slate-100/60 text-slate-800 selection:bg-indigo-500 selection:text-white">
      {/* Oceanic Shimmer Ambient Backdrop */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-25 overflow-hidden">
        <GradientBackground className="w-full h-full" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-800 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Scale className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight text-slate-900">MetriScan</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase tracking-wider">
                    AI Inspector
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono tracking-wide hidden sm:block">
                  Legal Metrology (Packaged Commodities) Rules
                </div>
              </div>
            </NavLink>

            <nav className="flex items-center gap-1.5">
              <NavLink to="/" end className={linkClasses}>
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/inspections/new" className={linkClasses}>
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Inspection</span>
              </NavLink>
              <NavLink to="/history" className={linkClasses}>
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
              </NavLink>
              {user?.role === 'ADMIN' && (
                <NavLink to="/rules" className={linkClasses}>
                  <BookOpenCheck className="w-3.5 h-3.5" />
                  <span>Rules</span>
                </NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-slate-700">{user?.name}</span>
              <span className="text-slate-300">|</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 uppercase">
                {user?.role}
              </span>
            </div>

            <button
              className="btn-ghost !py-1.5 !px-2.5 !text-xs text-slate-600 hover:text-red-600 hover:border-red-200"
              onClick={() => { signOut(); navigate('/login') }}
              title="Sign out of system"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {children}
      </main>
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
