import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Search,
  CheckCircle2,
  Clock,
  Check,
  FileCheck,
  Sliders,
  Sparkles,
  ExternalLink
} from 'lucide-react'
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
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // In-app modal for rule verification instead of browser window.prompt
  const [verifyingVersion, setVerifyingVersion] = useState(null)
  const [gazetteRef, setGazetteRef] = useState('')

  const load = () => api.rules().then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const openVerifyModal = (version, rule) => {
    setVerifyingVersion({ ...version, ruleTitle: rule.title, ruleCode: rule.code })
    setGazetteRef(version.source_reference || 'G.S.R. 418(E) dated 29 May 2026')
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    if (!verifyingVersion || !gazetteRef.trim()) return
    const versionId = verifyingVersion.id
    setVerifyingVersion(null)
    setBusy(versionId)
    setError('')
    try {
      await api.verifyVersion(versionId, gazetteRef.trim())
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  if (error && !data) return <div className="panel p-4 text-xs text-red-700 bg-red-50 border-red-200">{error}</div>
  if (!data) return <div className="p-8 text-center text-xs text-slate-500">Loading statutory rule catalogue…</div>

  const filteredRules = data.items.filter((rule) => {
    const matchesQuery = query === '' ||
      rule.code.toLowerCase().includes(query.toLowerCase()) ||
      rule.title.toLowerCase().includes(query.toLowerCase()) ||
      rule.description.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = activeCategory === 'all' || rule.category.toLowerCase() === activeCategory.toLowerCase()
    return matchesQuery && matchesCategory
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            Statutory Rule Catalogue & Gazette Verification
          </h1>
          <p className="text-xs text-slate-500">
            Legal Metrology (Packaged Commodities) Rules, 2011 & Gazette Notifications
          </p>
        </div>
      </div>

      {/* Gazette Unverified Notice */}
      {data.unverified_versions > 0 && (
        <section className="p-4 rounded-xl border border-amber-200 bg-amber-50/80 shadow-subtle flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-bold text-xs text-amber-900">
              {data.unverified_versions} Rule Version(s) Awaiting Gazette Certification
            </h2>
            <p className="text-[11px] text-amber-950 leading-relaxed max-w-3xl">
              Statutory verification prevents regulatory citations from executing uncorroborated text. Confirm each rule against the official published Gazette of India (G.S.R.) reference below before finalising legal dossiers.
            </p>
          </div>
        </section>
      )}

      {/* Search & Filter Bar */}
      <div className="panel p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            className="field pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by rule code (e.g. LMPC-R06-NAME), keywords..."
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'core', 'food', 'declaration'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                activeCategory === cat
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="panel p-3 text-xs text-red-700 bg-red-50 border-red-200">{error}</div>}

      {/* Rules Accordion / Cards */}
      <div className="space-y-3">
        {filteredRules.map((rule) => (
          <section key={rule.id} className="panel overflow-hidden border border-slate-200/90 shadow-subtle bg-white">
            <div className="px-4 py-3 border-b border-rule/60 flex flex-wrap items-center justify-between gap-2 bg-slate-50/40">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="num font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                  {rule.code}
                </span>
                <span className="font-semibold text-xs text-slate-900">{rule.title}</span>
              </div>
              <div className="flex items-center gap-1.5 text-2xs text-slate-500">
                <span className="capitalize px-1.5 py-0.2 rounded bg-slate-100 font-medium text-slate-700">
                  {rule.category}
                </span>
                <span>·</span>
                <span className="uppercase font-semibold text-slate-600">{rule.requirement_type}</span>
                {rule.field && <span>· field: <code className="font-mono text-indigo-700">{rule.field}</code></span>}
                <span>·</span>
                <span className={rule.severity === 'HIGH' ? 'text-red-600 font-bold' : 'text-amber-700 font-medium'}>
                  {rule.severity} Severity
                </span>
              </div>
            </div>

            <p className="px-4 py-2 text-xs text-slate-600 bg-white border-b border-rule/40 leading-relaxed">
              {rule.description}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Version</th>
                    <th className="th">Statutory Period</th>
                    <th className="th">Official Gazette Reference</th>
                    <th className="th">Verification Status</th>
                    <th className="th text-right">Gazette Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.versions.map((v) => {
                    const isVerified = v.verification_status === 'VERIFIED'

                    return (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="td num font-bold text-xs text-slate-900">v{v.version}</td>
                        <td className="td num text-2xs text-slate-600">
                          {v.effective_from || '—'} → {v.effective_to || 'Present'}
                        </td>
                        <td className="td text-xs font-mono text-slate-700">
                          {v.source_reference ? (
                            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              {v.source_reference}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No Gazette reference recorded</span>
                          )}
                        </td>
                        <td className="td">
                          <StatusBadge value={isVerified ? 'PASS' : 'REVIEW'} />
                        </td>
                        <td className="td text-right">
                          {!isVerified ? (
                            <button
                              type="button"
                              className="btn bg-slate-900 hover:bg-emerald-700 text-white !py-1 !px-2.5 !text-2xs inline-flex items-center gap-1 shadow-xs"
                              disabled={busy === v.id}
                              onClick={() => openVerifyModal(v, rule)}
                            >
                              <FileCheck className="w-3 h-3 text-emerald-400" />
                              <span>{busy === v.id ? 'Recording…' : 'Record Gazette Verification'}</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Legally Certified</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* In-App Gazette Verification Modal (replaces browser prompt) */}
      {verifyingVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="panel max-w-lg w-full bg-white shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider">Statutory Gazette Verification</h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifyingVersion(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifySubmit} className="p-5 space-y-4">
              <div>
                <div className="text-[11px] font-mono text-slate-500 uppercase">
                  {verifyingVersion.ruleCode} v{verifyingVersion.version}
                </div>
                <div className="font-semibold text-sm text-slate-900 mt-0.5">
                  {verifyingVersion.ruleTitle}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Certify that this rule logic conforms to the official published Gazette of India notification.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="gazette-ref">
                  Gazette of India Notification Reference (G.S.R.)
                </label>
                <input
                  id="gazette-ref"
                  className="field font-mono"
                  required
                  value={gazetteRef}
                  onChange={(e) => setGazetteRef(e.target.value)}
                  placeholder="e.g. G.S.R. 418(E) dated 29 May 2026"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  This statutory reference will be permanently attached to all subsequent inspection reports.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setVerifyingVersion(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn bg-slate-900 hover:bg-emerald-700 text-white"
                  disabled={!gazetteRef.trim()}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Certify Rule Version</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
