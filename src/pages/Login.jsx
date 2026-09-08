import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { GradientBackground } from '../components/ui/oceanic-shimmer.jsx'
import { ShinyButton } from '../components/ui/shiny-button.jsx'
import { Scale, ShieldCheck, Sparkles, Eye, CheckCircle2 } from 'lucide-react'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 relative overflow-hidden bg-slate-950">
      {/* Left Column: Oceanic Shimmer Brand Showcase */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white">
        <GradientBackground className="absolute inset-0 z-0 opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 z-0" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg">
              <Scale className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">MetriScan</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 uppercase tracking-wider">
                  AI Inspector
                </span>
              </div>
              <p className="text-xs text-cyan-100/80 font-mono">Government of India Legal Metrology</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-emerald-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>LMPC Rules 2011 Compliance Engine</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Automated Packaging Verification & Certified Compliance Dossiers
          </h1>
          <p className="mt-4 text-cyan-100/90 text-sm leading-relaxed">
            MetriScan analyzes packaged commodity declarations using multimodal optical intelligence, evaluates statutory rules in force on inspection day, and generates court-admissible PDF inspection certificates.
          </p>

          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
              <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
              <div className="text-xs text-white/90">
                <strong>Standard Country of Origin:</strong> Defaulted to India for domestic & imported commodities.
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
              <CheckCircle2 className="w-5 h-5 text-cyan-300 shrink-0" />
              <div className="text-xs text-white/90">
                <strong>Certified PDF Generation:</strong> Produces downloadable inspection reports with verified visual evidence.
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-cyan-200/60 font-mono">
          MetriScan &bull; Legal Metrology (Packaged Commodities) Enforcement
        </div>
      </div>

      {/* Right Column: Sign In Form */}
      <div className="flex items-center justify-center px-6 py-12 bg-white relative z-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-base tracking-tight text-slate-900">MetriScan AI</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign In</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">Enter your authorized credentials to access inspection console.</p>

          <label className="label" htmlFor="email">Official Email Address</label>
          <input
            id="email"
            className="field mb-3"
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="officer@metriscan.local"
          />

          <label className="label" htmlFor="password">Security Password</label>
          <input
            id="password"
            className="field mb-3"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p role="alert" className="mb-4 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs">
              {error}
            </p>
          )}

          <div className="mt-2 mb-4">
            <ShinyButton
              type="submit"
              disabled={busy}
              className="w-full !py-3 !text-sm"
            >
              <span>{busy ? 'Signing in…' : 'Sign In to MetriScan'}</span>
            </ShinyButton>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 text-2xs text-slate-500 space-y-2">
            <div className="font-semibold text-slate-700">One-Click Quick Login Accounts:</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-xs font-medium"
                onClick={() => { setEmail('officer@metriscan.local'); setPassword('MetriScan#2026') }}
              >
                Officer
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-xs font-medium"
                onClick={() => { setEmail('reviewer@metriscan.local'); setPassword('MetriScan#2026') }}
              >
                Reviewer
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-xs font-medium"
                onClick={() => { setEmail('admin@metriscan.local'); setPassword('MetriScan#2026') }}
              >
                Admin
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-1">Default Password: MetriScan#2026</p>
          </div>
        </form>
      </div>
    </div>
  )
}
