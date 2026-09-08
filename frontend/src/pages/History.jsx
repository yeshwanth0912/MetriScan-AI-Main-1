import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'

export default function History() {
  const [filters, setFilters] = useState({ q: '', status: '', compliance: '', category: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listInspections({ ...filters, page, page_size: 20 }).then(setData).catch((e) => setError(e.message))
  }, [filters, page])

  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }

  return (
    <div className="space-y-3">
      <section className="panel p-3 grid sm:grid-cols-4 gap-2">
        <div><label className="label" htmlFor="q">Search</label>
          <input id="q" className="field" value={filters.q} onChange={set('q')}
            placeholder="Reference, brand, product, location" /></div>
        <div><label className="label" htmlFor="wf">Workflow</label>
          <select id="wf" className="field" value={filters.status} onChange={set('status')}>
            <option value="">Any</option><option value="DRAFT">Draft</option>
            <option value="REVIEW">In review</option><option value="FINALIZED">Finalised</option>
          </select></div>
        <div><label className="label" htmlFor="cp">Compliance</label>
          <select id="cp" className="field" value={filters.compliance} onChange={set('compliance')}>
            <option value="">Any</option><option value="COMPLIANT">Compliant</option>
            <option value="NON_COMPLIANT">Non-compliant</option>
            <option value="REVIEW_REQUIRED">Review required</option>
          </select></div>
        <div><label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="field" value={filters.category} onChange={set('category')}>
            <option value="">Any</option><option value="food">Food</option>
            <option value="cosmetics">Cosmetics</option><option value="household">Household</option>
            <option value="other">Other</option>
          </select></div>
      </section>

      {error && <div className="panel p-4 text-fail">{error}</div>}

      <section className="panel">
        {!data ? <p className="p-4 text-muted">Loading inspections…</p>
          : data.items.length === 0 ? (
            <p className="p-6 text-center text-muted">
              No inspections match these filters. <Link className="underline" to="/inspections/new">Start a new one.</Link>
            </p>
          ) : (
            <>
              <table className="w-full">
                <thead><tr>
                  <th className="th">Reference</th><th className="th">Product</th>
                  <th className="th">Location</th><th className="th">Compliance</th>
                  <th className="th">Workflow</th><th className="th">Images</th><th className="th"></th>
                </tr></thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="td num">{row.reference}</td>
                      <td className="td">
                        {[row.product?.brand, row.product?.product_name].filter(Boolean).join(' ')
                          || <span className="text-muted">Unnamed</span>}
                      </td>
                      <td className="td">{row.location || <span className="text-muted">—</span>}</td>
                      <td className="td"><StatusBadge value={row.compliance_status} /></td>
                      <td className="td"><StatusBadge value={row.status} /></td>
                      <td className="td num">{row.image_count}</td>
                      <td className="td text-right">
                        <Link className="btn-ghost !py-1 !text-2xs" to={`/inspections/${row.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-2 px-3 py-2 text-2xs text-muted">
                <span>{data.total} inspection(s), page {data.page} of {data.pages}</span>
                <div className="ml-auto flex gap-1">
                  <button className="btn-ghost !py-1 !text-2xs" disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <button className="btn-ghost !py-1 !text-2xs" disabled={page >= data.pages}
                    onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            </>
          )}
      </section>
    </div>
  )
}
