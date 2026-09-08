import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  RotateCw,
  ShieldCheck,
  Unlock,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Check,
  Sparkles,
  Edit3,
  Sliders,
  Scale,
  ExternalLink,
  ChevronRight,
  Info,
  Upload,
  Image as ImageIcon
} from 'lucide-react'
import { api, downloadFile } from '../api.js'
import { useAuth } from '../auth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import EvidenceViewer from '../components/EvidenceViewer.jsx'

const FIELD_LABELS = {
  commodity_name: 'Name of commodity',
  net_quantity: 'Net quantity',
  mrp: 'Retail sale price (MRP)',
  manufacturer: 'Manufacturer / packer / importer',
  date_of_manufacture: 'Month and year of manufacture',
  best_before: 'Best before / Expiry',
  consumer_care: 'Consumer care details',
  country_of_origin: 'Country of origin',
  unit_sale_price: 'Unit sale price'
}

function confidenceTone(value) {
  if (value >= 0.9) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (value >= 0.7) return 'text-slate-800 bg-slate-100 border-slate-200'
  return 'text-amber-800 bg-amber-50 border-amber-200'
}

function heightCell(measurement) {
  if (!measurement) return <span className="text-slate-400 text-2xs">—</span>
  if (measurement.status === 'MEASURED') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-mono font-medium bg-slate-100 text-slate-800 border border-slate-200">
        {measurement.height_mm?.toFixed(2)} mm
      </span>
    )
  }
  return <span className="text-slate-400 text-2xs italic" title={measurement.detail}>no scale</span>
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

  // In-app reviewer override modal state
  const [modalFinding, setModalFinding] = useState(null)
  const [overrideDecision, setOverrideDecision] = useState('PASS')
  const [overrideNote, setOverrideNote] = useState('')

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

  const handleResolveSubmit = async (e) => {
    e.preventDefault()
    if (!modalFinding || !overrideNote.trim()) return
    const ruleResultId = modalFinding.id
    setModalFinding(null)
    await act('Resolving finding…', () =>
      api.decideResult(id, ruleResultId, {
        decision: 'OVERRIDDEN',
        note: overrideNote.trim(),
        override_result: overrideDecision
      })
    )
    if (selected) {
      const fresh = await api.evidence(id, selected)
      setEvidence(fresh)
    }
  }

  const handlePhotoUpload = async (e, imageType = 'back') => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(`Uploading ${imageType} packaging photograph…`)
    try {
      await api.uploadImage(id, file, imageType)
      setBusy('Scanning packaging labels with Gemini Vision AI…')
      await api.analyze(id)
      await load()
      if (selected) {
        const fresh = await api.evidence(id, selected)
        setEvidence(fresh)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
      e.target.value = ''
    }
  }

  if (error && !inspection) {
    return (
      <div className="panel p-6 text-center text-red-700 bg-red-50 border-red-200">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
        <div className="font-semibold text-sm">{error}</div>
      </div>
    )
  }

  if (!inspection || !results) {
    return (
      <div className="panel p-12 text-center text-slate-500">
        <div className="inline-flex p-3 rounded-full bg-slate-100 mb-2 animate-spin">
          <RotateCw className="w-5 h-5 text-slate-600" />
        </div>
        <div className="text-sm font-medium">Loading inspection record & findings…</div>
      </div>
    )
  }

  const finalized = inspection.status === 'FINALIZED'
  const fields = results.fields
  const counts = results.counts

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <section className="panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num font-bold text-base text-slate-900 tracking-tight">
              {inspection.reference}
            </span>
            <StatusBadge value={results.status} size="lg" />
            <StatusBadge value={inspection.status} />
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-700">
              {[inspection.product?.brand, inspection.product?.product_name].filter(Boolean).join(' ') || 'Unnamed package'}
            </span>
            {inspection.premises && <span>· {inspection.premises}</span>}
            {inspection.location && <span>({inspection.location})</span>}
            {inspection.channel === 'ecommerce' && (
              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium">
                E-Commerce
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost"
            disabled={!!busy || finalized}
            onClick={() => act('Re-analysing pack…', () => api.analyze(id))}
            title="Re-run OCR and rule engine"
          >
            <RotateCw className={`w-3.5 h-3.5 ${busy.startsWith('Re-analysing') ? 'animate-spin' : ''}`} />
            <span>{busy.startsWith('Re-analysing') ? 'Re-analysing…' : 'Re-analyse'}</span>
          </button>

          {!finalized && (
            <button
              className="btn bg-slate-900 hover:bg-emerald-700 text-white"
              disabled={!!busy}
              onClick={() => act('Finalising inspection…', () => api.finalize(id))}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Finalise Inspection</span>
            </button>
          )}

          {finalized && can('REVIEWER', 'ADMIN') && (
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() => act('Reopening inspection…', () => api.reopen(id))}
            >
              <Unlock className="w-3.5 h-3.5 text-amber-600" />
              <span>Reopen Dossier</span>
            </button>
          )}

          {finalized && (
            <button
              className="btn bg-slate-900 hover:bg-indigo-700"
              disabled={!!busy}
              onClick={() => act('Generating certified report…', () => api.generateReport(id))}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Generate Report</span>
            </button>
          )}
        </div>
      </section>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="panel px-3.5 py-2.5 flex items-center justify-between border-emerald-200/60 bg-emerald-50/30">
          <div>
            <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Pass</div>
            <div className="num text-xl font-bold text-emerald-800">{counts.PASS}</div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="panel px-3.5 py-2.5 flex items-center justify-between border-red-200/60 bg-red-50/30">
          <div>
            <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Failures</div>
            <div className="num text-xl font-bold text-red-800">{counts.FAIL}</div>
          </div>
          <XCircle className="w-5 h-5 text-red-600" />
        </div>
        <div className="panel px-3.5 py-2.5 flex items-center justify-between border-amber-200/60 bg-amber-50/30">
          <div>
            <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Review Needed</div>
            <div className="num text-xl font-bold text-amber-800">{counts.REVIEW}</div>
          </div>
          <Clock className="w-5 h-5 text-amber-600" />
        </div>
        <div className="panel px-3.5 py-2.5 flex items-center justify-between border-slate-200 bg-slate-50/50">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Not Applicable</div>
            <div className="num text-xl font-bold text-slate-700">{counts.NOT_APPLICABLE}</div>
          </div>
          <span className="text-xs text-slate-400 font-mono">N/A</span>
        </div>
        <div className="panel px-3.5 py-2.5 flex items-center justify-between border-slate-200 bg-slate-50/50">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Analysis Speed</div>
            <div className="num text-xl font-bold text-slate-800">
              {inspection.analysis_ms != null ? `${inspection.analysis_ms} ms` : '—'}
            </div>
          </div>
          <Sparkles className="w-4 h-4 text-indigo-500" />
        </div>
      </div>

      {error && (
        <div className="panel p-3 text-xs text-red-700 bg-red-50 border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Blocking Issues Alert */}
      {blocking.length > 0 && !finalized && (
        <section className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 shadow-subtle">
          <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs mb-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Conditions preventing finalisation:</span>
          </div>
          <ul className="space-y-1 text-xs text-amber-950 pl-6 list-disc">
            {blocking.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Packaging Evidence Photographs Strip */}
      <section className="panel p-3.5 bg-slate-50/50 border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span>Submitted Packaging Photographs</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                  AI Multimodal Vision Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Front PDP and 2nd Image (Back Declaration Panel) are analyzed for statutory declarations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="btn-ghost !text-2xs !py-1.5 !px-2.5 cursor-pointer hover:bg-slate-100 flex items-center gap-1.5 text-slate-700 border-slate-300">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload 2nd Image (Back Panel)</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!busy || finalized}
                onChange={(e) => handlePhotoUpload(e, 'back')}
              />
            </label>
            <label className="btn-ghost !text-2xs !py-1.5 !px-2.5 cursor-pointer hover:bg-slate-100 flex items-center gap-1.5 text-slate-700 border-slate-300">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload Front Image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!busy || finalized}
                onChange={(e) => handlePhotoUpload(e, 'front')}
              />
            </label>
          </div>
        </div>

        {/* Thumbnail gallery */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(inspection.images || []).map((img, idx) => {
            const isBack = img.image_type === 'back' || idx === 1
            return (
              <div
                key={img.id}
                className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group shadow-subtle"
              >
                <div className="aspect-[4/3] w-full flex items-center justify-center overflow-hidden bg-slate-950">
                  <img
                    src={`/api/inspections/${inspection.id}/images/${img.id}/file`}
                    alt={img.file_name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                </div>
                <div className="p-2 bg-white border-t border-slate-100 flex items-center justify-between text-2xs">
                  <div>
                    <span className="font-semibold text-slate-800 capitalize">
                      {idx + 1}. {img.image_type} Panel
                    </span>
                    {isBack && (
                      <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                        Statutory Details
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {(img.file_name || '').slice(-12)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Main Split: Declarations & Evidence Viewer */}
      <div className="grid lg:grid-cols-5 gap-4 items-start">
        {/* Left Column: Declarations (3 cols) */}
        <section className="panel lg:col-span-3">
          <div className="px-4 py-3 border-b border-rule/60 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Mandatory Declarations
              </h2>
              <p className="text-[11px] text-slate-500">Legal Metrology Packaged Commodities Rule 6</p>
            </div>
            <span className="text-[11px] text-slate-500">Click a row to inspect evidence</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Declaration</th>
                  <th className="th">Pack Value</th>
                  <th className="th">Confidence</th>
                  <th className="th">Panel</th>
                  <th className="th">Height</th>
                  <th className="th text-right">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const isSelected = selected === f.field_name
                  const confPct = Math.round(f.confidence * 100)

                  return (
                    <tr
                      key={f.field_name}
                      onClick={() => setSelected(f.field_name)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/70 font-medium'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="td">
                        <div className="flex items-center gap-1.5">
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                          <span className={isSelected ? 'text-indigo-950 font-semibold' : 'text-slate-800'}>
                            {FIELD_LABELS[f.field_name] || f.field_name}
                          </span>
                        </div>
                      </td>

                      <td className="td">
                        {f.present ? (
                          <div className="max-w-[200px] truncate text-slate-900" title={f.effective_value}>
                            {f.effective_value}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-medium text-2xs">
                            <XCircle className="w-3 h-3" /> Not declared
                          </span>
                        )}
                        {f.verification_status === 'CORRECTED' && (
                          <span className="ml-1 text-[10px] text-indigo-600 font-semibold">(officer-corrected)</span>
                        )}
                        {f.notes?.length > 0 && (
                          <div className="text-[10px] text-amber-700 mt-0.5">{f.notes.join(' ')}</div>
                        )}
                      </td>

                      <td className="td">
                        {f.present ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-mono font-medium border ${confidenceTone(f.confidence)}`}>
                            {confPct}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-2xs">—</span>
                        )}
                      </td>

                      <td className="td text-2xs text-slate-500 capitalize">
                        {f.panel || '—'}
                      </td>

                      <td className="td">
                        {heightCell(f.measurement)}
                      </td>

                      <td className="td text-right">
                        <button
                          type="button"
                          className={`btn-ghost !py-1 !px-2 !text-2xs ${isSelected ? '!border-indigo-300 !bg-white text-indigo-700' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setSelected(f.field_name) }}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Evidence</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column: Evidence & Verification Controls (2 cols) */}
        <section className="panel lg:col-span-2">
          <div className="px-4 py-3 border-b border-rule/60 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {selected ? `Evidence · ${FIELD_LABELS[selected] || selected}` : 'Evidence & Correction'}
            </h2>
            {selected && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                {selected}
              </span>
            )}
          </div>

          {!selected ? (
            <div className="p-8 text-center text-slate-400">
              <Eye className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium text-slate-700">Select a declaration from the table</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                Inspect the photograph bounding box, review character height, or adjust values before signing off.
              </p>
            </div>
          ) : !evidence ? (
            <div className="p-8 text-center text-slate-400">
              <RotateCw className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-400" />
              <p className="text-xs">Loading evidence photograph…</p>
            </div>
          ) : (
            <div className="p-4 space-y-3.5">
              {/* Image with Interactive Reticle */}
              <EvidenceViewer
                imageUrl={evidence.image_url}
                bbox={evidence.field.evidence?.bbox}
                caption={evidence.field.evidence?.ocr_text
                  ? `Raw OCR Output: “${evidence.field.evidence.ocr_text}”`
                  : null}
              />

              {/* Character Height Measurement Details */}
              {evidence.measurement && (
                <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5 mb-0.5">
                    <Scale className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Physical Character Height Analysis</span>
                  </div>
                  <div className="text-slate-600 text-[11px]">
                    {evidence.measurement.status === 'MEASURED'
                      ? `Measured at ${evidence.measurement.height_mm.toFixed(2)} mm via ${evidence.measurement.method} (${evidence.measurement.scale?.px_per_mm} px/mm calibrated scale).`
                      : evidence.measurement.detail}
                  </div>
                </div>
              )}

              {/* Corrected Value Form */}
              <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-subtle">
                <label className="label" htmlFor="correct">
                  Field Override / Correction
                </label>
                <div className="flex gap-2">
                  <input
                    id="correct"
                    className="field"
                    value={draft}
                    disabled={finalized}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type printed value if OCR misread"
                  />
                  <button
                    className="btn bg-slate-900 hover:bg-indigo-600 text-white shrink-0"
                    disabled={!!busy || finalized}
                    onClick={() => act('Saving correction…', async () => {
                      await api.correctField(id, selected, draft)
                      const fresh = await api.evidence(id, selected)
                      setEvidence(fresh)
                    })}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Updates re-evaluate all rules tied to this declaration while maintaining evidentiary audit logs.
                </p>
              </div>

              {/* Applicable Rule Findings for this Field */}
              {evidence.rule_results.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-rule/60">
                  <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                    Applicable Legal Metrology Rules
                  </div>
                  {evidence.rule_results.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-lg border border-slate-200/90 bg-white shadow-subtle space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-mono text-slate-500">
                            {r.rule_code} v{r.rule_version ?? '1.0'}
                            {r.verification_status !== 'VERIFIED' && (
                              <span className="text-amber-700 font-semibold ml-1.5">
                                · unverified rule text
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-xs text-slate-900">{r.title}</div>
                        </div>
                        <StatusBadge value={r.result} />
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{r.reason}</p>

                      {r.source_reference && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Citation: {r.source_reference}
                        </div>
                      )}

                      {/* Reviewer Action Buttons */}
                      {can('REVIEWER', 'ADMIN') && !finalized && r.reviewer_status === 'MACHINE' && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                          {r.result !== 'REVIEW' && (
                            <button
                              className="btn-ghost !py-1 !text-2xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                              disabled={!!busy}
                              onClick={() => act('Confirming finding…', () =>
                                api.decideResult(id, r.id, { decision: 'CONFIRMED' }))}
                            >
                              <Check className="w-3 h-3" />
                              <span>Confirm Machine Finding</span>
                            </button>
                          )}
                          <button
                            className="btn-ghost !py-1 !text-2xs text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
                            disabled={!!busy}
                            onClick={() => {
                              setModalFinding(r)
                              setOverrideDecision(r.result === 'REVIEW' ? 'PASS' : 'NOT_APPLICABLE')
                              setOverrideNote('')
                            }}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>{r.result === 'REVIEW' ? 'Resolve Finding' : 'Override Result'}</span>
                          </button>
                        </div>
                      )}

                      {r.reviewer_status !== 'MACHINE' && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                          <span className="font-semibold capitalize text-slate-700">{r.reviewer_status.toLowerCase()} by reviewer</span>
                          {r.reviewer_note && `: "${r.reviewer_note}"`}
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

      {/* All Findings Table */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-rule/60 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Complete Legal Metrology Audit Findings ({results.rule_results.length})
          </h2>
          <span className="text-[11px] text-slate-500">Evaluated against statutory schedules</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Result</th>
                <th className="th">Statutory Rule</th>
                <th className="th">Evaluation & Reason</th>
                <th className="th">Severity</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.rule_results.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="td">
                    <StatusBadge value={r.result} />
                  </td>
                  <td className="td">
                    <div className="num text-[11px] text-slate-500">{r.rule_code} v{r.rule_version ?? '—'}</div>
                    <div className="font-medium text-slate-900 text-xs">{r.title}</div>
                  </td>
                  <td className="td text-xs text-slate-600 max-w-md">
                    {r.reason}
                  </td>
                  <td className="td">
                    {r.result === 'FAIL' ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold ${
                        r.severity === 'HIGH'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {r.severity}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-2xs">—</span>
                    )}
                  </td>
                  <td className="td text-2xs text-slate-500">
                    {r.reviewer_status !== 'MACHINE' ? (
                      <span className="font-medium text-indigo-700">{r.reviewer_status}</span>
                    ) : (
                      <span>Machine</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reports Section */}
      {reports.length > 0 && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-rule/60 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Generated Regulatory Inspection Certificates ({reports.length})
            </h2>
            <span className="text-[11px] text-slate-500">Court-admissible inspection reports</span>
          </div>
          <div className="divide-y divide-rule/60">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">{r.reference}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <StatusBadge value={r.status === 'READY' ? 'PASS' : 'REVIEW'} />
                      <span>· Ready for export</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost !py-1.5 !px-3 !text-xs text-slate-700 hover:text-slate-900"
                    onClick={() => downloadFile(r.pdf_url, `${r.reference}.pdf`)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    className="btn-ghost !py-1.5 !px-3 !text-xs text-slate-700 hover:text-slate-900"
                    onClick={() => downloadFile(r.json_url, `${r.reference}.json`)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* In-App Reviewer Decision Modal (replaces browser prompt) */}
      {modalFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="panel max-w-lg w-full bg-white shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider">Reviewer Statutory Decision</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalFinding(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="p-5 space-y-4">
              <div>
                <div className="text-[11px] font-mono text-slate-500 uppercase">{modalFinding.rule_code}</div>
                <div className="font-semibold text-sm text-slate-900">{modalFinding.title}</div>
                <p className="text-xs text-slate-600 mt-1">{modalFinding.reason}</p>
              </div>

              <div>
                <label className="label">Statutory Determination</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'PASS', label: 'PASS', tone: 'hover:border-emerald-500 text-emerald-700' },
                    { id: 'FAIL', label: 'FAIL', tone: 'hover:border-red-500 text-red-700' },
                    { id: 'NOT_APPLICABLE', label: 'N / A', tone: 'hover:border-slate-500 text-slate-700' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOverrideDecision(opt.id)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                        overrideDecision === opt.id
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : `border-slate-200 bg-slate-50 ${opt.tone}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label" htmlFor="decision-note">
                  Reviewer Justification / Legal Basis (Required)
                </label>
                <textarea
                  id="decision-note"
                  className="field"
                  rows={3}
                  required
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="State the legal justification for overriding this finding..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setModalFinding(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn bg-slate-900 hover:bg-emerald-700 text-white"
                  disabled={!overrideNote.trim()}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Legal Determination</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
