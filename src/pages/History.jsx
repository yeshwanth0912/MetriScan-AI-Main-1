import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Filter,
  Plus,
  ArrowRight,
  Camera,
  Store,
  Globe,
  UtensilsCrossed,
  Sparkles,
  Home,
  Package,
  ChevronLeft,
  ChevronRight,
  RotateCcw
} from 'lucide-react'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'

const CATEGORY_ICONS = {
  food: UtensilsCrossed,
  cosmetics: Sparkles,
  household: Home,
  other: Package
}

export default function History() {
  const [filters, setFilters] = useState({ q: '', status: '', compliance: '', category: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listInspections({ ...filters, page, page_size: 20 }).then(setData).catch((e) => setError(e.message))
  }, [filters, page])

  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }

  const clearFilters = () => {
    setPage(1)
    setFilters({ q: '', status: '', compliance: '', category: '' })
  }

  const hasActiveFilters = Boolean(filters.q || filters.status || filters.compliance || filters.category)

  return (
    <div className="space-y-4">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Regulatory Inspection Ledger
          </h1>
          <p className="text-xs text-slate-500">
            Historical audit dossiers, evidence photographs, and certified findings
          </p>
        </div>
        <Link
          to="/inspections/new"
          className="btn bg-slate-900 hover:bg-indigo-700 text-white shadow-sm inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>New Inspection</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <section className="panel p-3.5 bg-white space-y-3">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative">
            <label className="label flex items-center justify-between" htmlFor="q">
              <span>Search Ledger</span>
              {filters.q && (
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
              <input
                id="q"
                className="field pl-8"
                value={filters.q}
                onChange={set('q')}
                placeholder="Reference, brand, premises, town..."
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="wf">Workflow State</label>
            <select id="wf" className="field font-medium" value={filters.status} onChange={set('status')}>
              <option value="">All Workflow States</option>
              <option value="DRAFT">Draft</option>
              <option value="REVIEW">Under Review</option>
              <option value="FINALIZED">Finalised</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="cp">Compliance Determination</label>
            <select id="cp" className="field font-medium" value={filters.compliance} onChange={set('compliance')}>
              <option value="">All Determinations</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="NON_COMPLIANT">Non-Compliant</option>
              <option value="REVIEW_REQUIRED">Review Required</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="cat">Commodity Category</label>
            <select id="cat" className="field font-medium" value={filters.category} onChange={set('category')}>
              <option value="">All Categories</option>
              <option value="food">Food & Beverages</option>
              <option value="cosmetics">Cosmetics & Personal</option>
              <option value="household">Household & Detergents</option>
              <option value="other">Other Commodities</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-rule/60 text-2xs text-slate-500">
            <span>Filters applied to ledger view</span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset all filters</span>
            </button>
          </div>
        )}
      </section>

      {error && <div className="panel p-4 text-xs text-red-700 bg-red-50 border-red-200">{error}</div>}

      {/* Ledger Table */}
      <section className="panel overflow-hidden">
        {!data ? (
          <p className="p-8 text-center text-xs text-slate-500">Loading ledger dossiers…</p>
        ) : data.items.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Package className="w-8 h-8 mx-auto text-slate-300" />
            <div className="text-xs font-semibold text-slate-700">No inspections match current criteria</div>
            <p className="text-[11px] text-slate-400">
              Try adjusting your search terms or filter constraints.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-ghost !text-xs mt-2"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Reference</th>
                    <th className="th">Product & Brand</th>
                    <th className="th">Premises / Location</th>
                    <th className="th">Compliance</th>
                    <th className="th">Workflow</th>
                    <th className="th">Evidence</th>
                    <th className="th text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const CatIcon = CATEGORY_ICONS[row.product?.category] || Package

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="td">
                          <Link
                            to={`/inspections/${row.id}`}
                            className="num font-bold text-xs text-slate-900 hover:text-indigo-600 tracking-tight"
                          >
                            {row.reference}
                          </Link>
                        </td>

                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                              <CatIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-slate-800 truncate">
                                {[row.product?.brand, row.product?.product_name].filter(Boolean).join(' ') || 'Unnamed Commodity'}
                              </div>
                              <div className="text-[10px] text-slate-400 capitalize">
                                {row.product?.category || 'pack'}
                                {row.channel === 'ecommerce' && (
                                  <span className="ml-1 text-indigo-600 font-semibold">· E-Commerce</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="td text-xs text-slate-600">
                          <div>{row.premises || <span className="text-slate-400">—</span>}</div>
                          {row.location && (
                            <div className="text-[10px] text-slate-400">{row.location}</div>
                          )}
                        </td>

                        <td className="td">
                          <StatusBadge value={row.compliance_status} />
                        </td>

                        <td className="td">
                          <StatusBadge value={row.status} />
                        </td>

                        <td className="td">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            <Camera className="w-3 h-3 text-slate-500" />
                            <span>{row.image_count}</span>
                          </span>
                        </td>

                        <td className="td text-right">
                          <Link
                            className="btn-ghost !py-1 !px-2.5 !text-2xs text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                            to={`/inspections/${row.id}`}
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-rule/60 text-2xs text-slate-500 bg-slate-50/50">
              <div>
                Showing page <span className="font-bold text-slate-800">{data.page}</span> of <span className="font-bold text-slate-800">{data.pages || 1}</span> ({data.total} total inspection records)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn-ghost !py-1 !px-2.5 !text-2xs inline-flex items-center gap-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-1 !px-2.5 !text-2xs inline-flex items-center gap-1"
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
