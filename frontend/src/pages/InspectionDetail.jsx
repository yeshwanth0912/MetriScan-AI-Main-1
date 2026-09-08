import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, downloadFile } from '../api.js'
import { useAuth } from '../auth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import EvidenceViewer from '../components/EvidenceViewer.jsx'

const FIELD_LABELS = {
  commodity_name: 'Name of commodity',
  net_quantity: 'Net quantity',
  mrp: 'Retail sale price',
  manufacturer: 'Manufacturer / packer / importer',
  date_of_manufacture: 'Month and year of manufacture',
  best_before: 'Best before',
  consumer_care: 'Consumer care details',
  country_of_origin: 'Country of origin',
  unit_sale_price: 'Unit sale price'
}

function confidenceTone(value) {
  if (value >= 0.9) return 'text-pass'
  if (value >= 0.7) return 'text-ink'
  return 'text-review'
}

function heightCell(measurement) {
  if (!measurement) return <span className="text-muted">—</span>
  if (measurement.status === 'MEASURED') {
    return <span className="num">{measurement.height_mm?.toFixed(2)} mm</span>
  }
  return <span className="text-muted" title={measurement.detail}>no scale</span>
}

export default function InspectionDetail() {
  const { id } = useParams()
  const { can } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [results, setResults] = useState(null)
  const [reports, setReports] = useState([])
  const [selected, setSelected] = useState(null)
  const [evidence, setEvidence] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [blocking, setBlocking] = useState([])

  const load = useCallback(async () => {
    const [ins, res, reps] = await Promise.all([
      api.getInspection(id), api.results(id), api.listReports(id)
    ])
    setInspection(ins)
    setResults(res)
    setReports(reps)
    setBlocking(res.blocking_issues || [])
  }, [id])

  useEffect(() => { load().catch((e) => setError(e.message)) }, [load])

  useEffect(() => {
    if (!selected) { setEvidence(null); return }
    api.evidence(id, selected).then((data) => {
      setEvidence(data)
      setDraft(data.field.effective_value || '')
    }).catch((e) => setError(e.message))
  }, [id, selected])

  const act = async (label, fn) => {
    setBusy(label); setError('')
    try { await fn(); await load() }
    catch (e) {
      setError(e.message)
      if (e.detail?.blocking_issues) setBlocking(e.detail.blocking_issues)
    }
    finally { setBusy('') }
  }

  if (error && !inspection) return <div className="panel p-4 text-fail">{error}</div>
  if (!inspection || !results) return <div className="p-2 text-muted">Loading inspection…</div>

  const finalized = inspection.status === 'FINALIZED'
  const fields = results.fields
  const counts = results.counts

  return (
    <div className="space-y-3">
      <section className="panel px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <div className="num font-semibold">{inspection.reference}</div>
          <div className="text-2xs text-muted">
            {[inspection.product?.brand, inspection.product?.product_name].filter(Boolean).join(' ') || 'Unnamed product'}
            {inspection.premises && ` · ${inspection.premises}`}
            {inspection.location && `, ${inspection.location}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={results.status} size="lg" />
          <StatusBadge value={inspection.status} />
        </div>
        <div className="num text-2xs text-muted flex gap-3">
          <span className="text-pass">{counts.PASS} pass</span>
          <span className="text-fail">{counts.FAIL} fail</span>
          <span className="text-review">{counts.REVIEW} review</span>
          <span>{counts.NOT_APPLICABLE} n/a</span>
          {inspection.analysis_ms != null && <span>{inspection.analysis_ms} ms</span>}
        </div>

        <div className="ml-auto flex flex-wrap gap-1.5">
          <button className="btn-ghost" disabled={!!busy || finalized}
            onClick={() => act('Re-analysing…', () => api.analyze(id))}>
            {busy === 'Re-analysing…' ? 'Re-analysing…' : 'Re-analyse'}
          </button>
          {!finalized && (
            <button className="btn" disabled={!!busy}
              onClick={() => act('Finalising…', () => api.finalize(id))}>Finalise</button>
          )}
          {finalized && can('REVIEWER', 'ADMIN') && (
            <button className="btn-ghost" disabled={!!busy}
              onClick={() => act('Reopening…', () => api.reopen(id))}>Reopen</button>
          )}
          {finalized && (
            <button className="btn-ghost" disabled={!!busy}
              onClick={() => act('Generating report…', () => api.generateReport(id))}>Generate report</button>
          )}
        </div>
      </section>

      {error && <div className="panel px-3 py-2 text-fail">{error}</div>}

      {blocking.length > 0 && !finalized && (
        <section className="panel px-3 py-2 border-review/40 bg-review/5">
          <h2 className="font-semibold text-review">Before this inspection can be finalised</h2>
          <ul className="mt-1 space-y-0.5 text-2xs">
            {blocking.map((issue, i) => <li key={i}>· {issue}</li>)}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-5 gap-3 items-start">
        <section className="panel lg:col-span-3">
          <h2 className="font-semibold px-3 py-2 border-b border-rule">Declarations</h2>
          <table className="w-full">
            <thead><tr>
              <th className="th">Declaration</th><th className="th">Value</th>
              <th className="th">Conf.</th><th className="th">Panel</th>
              <th className="th">Height</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.field_name} className={selected === f.field_name ? 'bg-paper' : ''}>
                  <td className="td">{FIELD_LABELS[f.field_name] || f.field_name}</td>
                  <td className="td">
                    {f.present
                      ? <span>{f.effective_value}</span>
                      : <span className="text-fail">Not declared</span>}
                    {f.verification_status === 'CORRECTED' && (
                      <span className="ml-1 text-2xs text-muted">(corrected)</span>
                    )}
                    {f.notes?.length > 0 && (
                      <div className="text-2xs text-review mt-0.5">{f.notes.join(' ')}</div>
                    )}
                  </td>
                  <td className={`td num ${confidenceTone(f.confidence)}`}>
                    {f.present ? `${Math.round(f.confidence * 100)}%` : '—'}
                  </td>
                  <td className="td text-2xs text-muted">{f.panel}</td>
                  <td className="td">{heightCell(f.measurement)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost !py-1 !text-2xs"
                      onClick={() => setSelected(f.field_name)}>Evidence</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel lg:col-span-2">
          <h2 className="font-semibold px-3 py-2 border-b border-rule">
            {selected ? `Evidence · ${FIELD_LABELS[selected] || selected}` : 'Evidence'}
          </h2>
          {!selected ? (
            <p className="p-4 text-muted">
              Choose a declaration to see the image region it was read from, the rules applied to it,
              and the correction controls.
            </p>
          ) : !evidence ? (
            <p className="p-4 text-muted">Loading evidence…</p>
          ) : (
            <div className="p-3 space-y-2.5">
              <EvidenceViewer
                imageUrl={evidence.image_url}
                bbox={evidence.field.evidence?.bbox}
                caption={evidence.field.evidence?.ocr_text
                  ? `OCR read: “${evidence.field.evidence.ocr_text}”`
                  : null}
              />

              {evidence.measurement && (
                <div className="text-2xs text-muted border border-rule rounded px-2 py-1.5">
                  <span className="font-semibold text-ink">Character height. </span>
                  {evidence.measurement.status === 'MEASURED'
                    ? `${evidence.measurement.height_mm.toFixed(2)} mm, measured by ${evidence.measurement.method} at ${evidence.measurement.scale?.px_per_mm} px/mm.`
                    : evidence.measurement.detail}
                </div>
              )}

              <div>
                <label className="label" htmlFor="correct">Corrected value</label>
                <div className="flex gap-1.5">
                  <input id="correct" className="field" value={draft} disabled={finalized}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type what is actually printed on the pack" />
                  <button className="btn" disabled={!!busy || finalized}
                    onClick={() => act('Saving…', async () => {
                      await api.correctField(id, selected, draft)
                      const fresh = await api.evidence(id, selected)
                      setEvidence(fresh)
                    })}>Save</button>
                </div>
                <p className="text-2xs text-muted mt-1">
                  The original reading is kept. Saving re-runs the rules that depend on this value.
                </p>
              </div>

              {evidence.rule_results.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-rule">
                  {evidence.rule_results.map((r) => (
                    <div key={r.id} className="pt-1.5">
                      <div className="flex items-start gap-2">
                        <StatusBadge value={r.result} />
                        <div className="flex-1">
                          <div className="text-2xs num text-muted">
                            {r.rule_code} v{r.rule_version ?? '—'}
                            {r.verification_status !== 'VERIFIED' && (
                              <span className="text-review"> · rule text unverified</span>
                            )}
                          </div>
                          <div className="font-medium">{r.title}</div>
                          <div className="text-2xs">{r.reason}</div>
                          {r.source_reference && (
                            <div className="text-2xs text-muted mt-0.5">Source: {r.source_reference}</div>
                          )}
                        </div>
                      </div>
                      {can('REVIEWER', 'ADMIN') && !finalized && r.reviewer_status === 'MACHINE' && (
                        <div className="flex gap-1.5 mt-1">
                          {r.result !== 'REVIEW' && (
                            <button className="btn-ghost !py-0.5 !text-2xs" disabled={!!busy}
                              onClick={() => act('Confirming…', () =>
                                api.decideResult(id, r.id, { decision: 'CONFIRMED' }))}>
                              Confirm finding
                            </button>
                          )}
                          <button className="btn-ghost !py-0.5 !text-2xs" disabled={!!busy}
                            onClick={() => {
                              const note = window.prompt('Reviewer note / reason:')
                              if (!note) return
                              const choice = (window.prompt('Resolve as PASS, FAIL, or NOT_APPLICABLE:', r.result === 'REVIEW' ? 'PASS' : 'NOT_APPLICABLE') || '').trim().toUpperCase()
                              if (!['PASS', 'FAIL', 'NOT_APPLICABLE'].includes(choice)) return
                              act('Resolving…', () =>
                                api.decideResult(id, r.id, {
                                  decision: 'OVERRIDDEN', note, override_result: choice
                                }))
                            }}>
                            {r.result === 'REVIEW' ? 'Resolve finding' : 'Override'}
                          </button>
                        </div>
                      )}
                      {r.reviewer_status !== 'MACHINE' && (
                        <div className="text-2xs text-muted mt-0.5">
                          {r.reviewer_status.toLowerCase()} by reviewer
                          {r.reviewer_note && `: ${r.reviewer_note}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <h2 className="font-semibold px-3 py-2 border-b border-rule">All findings</h2>
        <table className="w-full">
          <thead><tr>
            <th className="th">Result</th><th className="th">Rule</th>
            <th className="th">Reason</th><th className="th">Severity</th>
          </tr></thead>
          <tbody>
            {results.rule_results.map((r) => (
              <tr key={r.id}>
                <td className="td"><StatusBadge value={r.result} /></td>
                <td className="td">
                  <div className="num text-2xs text-muted">{r.rule_code} v{r.rule_version ?? '—'}</div>
                  <div>{r.title}</div>
                </td>
                <td className="td text-2xs">{r.reason}</td>
                <td className="td text-2xs">{r.result === 'FAIL' ? r.severity : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {reports.length > 0 && (
        <section className="panel">
          <h2 className="font-semibold px-3 py-2 border-b border-rule">Reports</h2>
          <ul>
            {reports.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-rule last:border-0">
                <span className="num">{r.reference}</span>
                <StatusBadge value={r.status === 'READY' ? 'PASS' : 'REVIEW'} />
                <div className="ml-auto flex gap-1.5">
                  <button className="btn-ghost !py-1 !text-2xs"
                    onClick={() => downloadFile(r.pdf_url, `${r.reference}.pdf`)}>PDF</button>
                  <button className="btn-ghost !py-1 !text-2xs"
                    onClick={() => downloadFile(r.json_url, `${r.reference}.json`)}>Structured data</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
