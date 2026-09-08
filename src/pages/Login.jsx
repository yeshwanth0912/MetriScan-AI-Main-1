import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

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
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center bg-ink text-white px-10 py-8">
        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Photograph a pack. Read the declarations. See the evidence behind every finding.
          </h1>
          <p className="mt-3 text-white/70 leading-relaxed">
            MetriScan extracts the mandatory declarations from a packaged commodity label and
            checks them against the Legal Metrology rules in force on the date of inspection.
          </p>
          <dl className="mt-6 space-y-2 text-sm text-white/70">
            <div className="flex gap-2"><dt className="font-mono text-white">01</dt>
              <dd>Extraction is machine-assisted. Compliance is decided by a versioned rule engine.</dd></div>
            <div className="flex gap-2"><dt className="font-mono text-white">02</dt>
              <dd>Anything the system cannot establish goes to review, never to a failure.</dd></div>
            <div className="flex gap-2"><dt className="font-mono text-white">03</dt>
              <dd>Every finding traces back to an image region and a rule version.</dd></div>
          </dl>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-xl font-bold">Sign in</h2>
          <p className="text-muted mb-4">Use the account issued by your controller.</p>

          <label className="label" htmlFor="email">Official email</label>
          <input id="email" className="field mb-3" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required placeholder="officer@metriscan.local" />

          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="field mb-3" type="password" value={password}
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />

          {error && (
            <p role="alert" className="mb-3 px-2.5 py-2 rounded border border-fail/40 bg-fail/5 text-fail">
              {error}
            </p>
          )}

          <button className="btn w-full justify-center" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-4 pt-3 border-t border-rule text-2xs text-muted space-y-1.5">
            <div className="font-semibold text-ink">Demo Accounts (Password: MetriScan#2026)</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn-ghost !py-1 !px-2 !text-2xs"
                onClick={() => { setEmail('officer@metriscan.local'); setPassword('MetriScan#2026') }}>
                Officer
              </button>
              <button type="button" className="btn-ghost !py-1 !px-2 !text-2xs"
                onClick={() => { setEmail('reviewer@metriscan.local'); setPassword('MetriScan#2026') }}>
                Reviewer
              </button>
              <button type="button" className="btn-ghost !py-1 !px-2 !text-2xs"
                onClick={() => { setEmail('admin@metriscan.local'); setPassword('MetriScan#2026') }}>
                Admin
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
