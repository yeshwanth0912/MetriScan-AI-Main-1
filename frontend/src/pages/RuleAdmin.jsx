import { useEffect, useState } from 'react'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'

/**
 * Rule administration. The point of this screen is the verification state:
 * a rule version that has not been checked against the gazette text cannot
 * support a finalised inspection, and this is where that check is recorded.
 */
export default function RuleAdmin() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = () => api.rules().then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const verify = async (version) => {
    const ref = window.prompt(
      'Record the gazette reference you checked this version against:',
      version.source_reference || ''
    )
    if (!ref) return
    setBusy(version.id); setError('')
    try { await api.verifyVersion(version.id, ref); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy('') }
  }

  if (error) return <div className="panel p-4 text-fail">{error}</div>
  if (!data) return <div className="p-2 text-muted">Loading rules…</div>

  return (
    <div className="space-y-3">
      {data.unverified_versions > 0 && (
        <section className="panel px-3 py-2 border-review/40 bg-review/5">
          <h2 className="font-semibold text-review">
            {data.unverified_versions} rule version(s) have not been checked against the gazette text
          </h2>
          <p className="text-2xs mt-0.5">
            The rule pack ships with placeholder legal content so the engine can be tested. Open the
            current consolidated Rules, replace each definition, record the G.S.R. reference, then mark
            the version verified. Inspections relying on an unverified version cannot be finalised.
          </p>
        </section>
      )}

      {data.items.map((rule) => (
        <section key={rule.id} className="panel">
          <div className="px-3 py-2 border-b border-rule flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num font-semibold">{rule.code}</span>
            <span className="font-medium">{rule.title}</span>
            <span className="text-2xs text-muted">
              {rule.category} · {rule.requirement_type}
              {rule.field && ` · ${rule.field}`} · {rule.severity}
            </span>
          </div>
          <p className="px-3 py-1.5 text-2xs text-muted border-b border-rule">{rule.description}</p>
          <table className="w-full">
            <thead><tr>
              <th className="th">Version</th><th className="th">In force</th>
              <th className="th">Source</th><th className="th">Status</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {rule.versions.map((v) => (
                <tr key={v.id}>
                  <td className="td num">v{v.version}</td>
                  <td className="td num text-2xs">
                    {v.effective_from || '—'} → {v.effective_to || 'open'}
                  </td>
                  <td className="td text-2xs">{v.source_reference || <span className="text-muted">Not recorded</span>}</td>
                  <td className="td">
                    <StatusBadge value={v.verification_status === 'VERIFIED' ? 'PASS' : 'REVIEW'} />
                    <div className="text-2xs text-muted mt-0.5">{v.verification_status}</div>
                  </td>
                  <td className="td text-right">
                    {v.verification_status !== 'VERIFIED' && (
                      <button className="btn-ghost !py-1 !text-2xs" disabled={busy === v.id}
                        onClick={() => verify(v)}>
                        {busy === v.id ? 'Saving…' : 'Mark verified'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
