import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'

function Metric({ label, value, tone = 'text-ink' }) {
  return (
    <div className="panel px-3 py-2">
      <div className="text-2xs text-muted">{label}</div>
      <div className={`num text-2xl font-semibold leading-tight ${tone}`}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState({ summary: null, violations: [], trends: [], queue: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.summary(), api.topViolations(), api.trends(30), api.reviewQueue()])
      .then(([summary, violations, trends, queue]) => setData({ summary, violations, trends, queue }))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="panel p-4 text-fail">{error}</div>
  if (!data.summary) return <div className="text-muted p-2">Loading inspection statistics…</div>

  const s = data.summary
  const rate = s.compliance_rate == null ? '—' : `${Math.round(s.compliance_rate * 100)}%`

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Metric label="Inspections" value={s.total_inspections} />
        <Metric label="Compliant" value={s.compliant} tone="text-pass" />
        <Metric label="Non-compliant" value={s.non_compliant} tone="text-fail" />
        <Metric label="Awaiting review" value={s.review_pending} tone="text-review" />
        <Metric label="Compliance rate" value={rate} />
        <Metric label="Median analysis" value={s.average_analysis_ms ? `${s.average_analysis_ms} ms` : '—'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <section className="panel p-3 lg:col-span-2">
          <h2 className="font-semibold mb-2">Inspections over the last 30 days</h2>
          {data.trends.length === 0 ? (
            <p className="text-muted py-6 text-center">No inspections recorded yet. Start one to see the trend here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.trends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#C9D2DA" strokeDasharray="2 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5B6B7B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5B6B7B' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: '#C9D2DA' }} />
                <Line type="monotone" dataKey="COMPLIANT" stroke="#1B7F4C" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="NON_COMPLIANT" stroke="#B3261E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="REVIEW_REQUIRED" stroke="#B26A00" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel p-3">
          <h2 className="font-semibold mb-2">Most frequent violations</h2>
          {data.violations.length === 0 ? (
            <p className="text-muted py-6 text-center">No violations recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.violations} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#5B6B7B' }} />
                <YAxis type="category" dataKey="rule_code" width={72}
                  tick={{ fontSize: 11, fill: '#5B6B7B' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: '#C9D2DA' }}
                  formatter={(v, n, p) => [v, p.payload.title]} />
                <Bar dataKey="count" fill="#B3261E" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="panel">
        <h2 className="font-semibold px-3 py-2 border-b border-rule">Waiting on a person</h2>
        {data.queue.length === 0 ? (
          <p className="text-muted p-4 text-center">Nothing is waiting for review. Start an inspection to add to the queue.</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Reference</th><th className="th">Product</th>
              <th className="th">Status</th><th className="th">Severity</th>
              <th className="th">Open reviews</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {data.queue.map((row) => (
                <tr key={row.id}>
                  <td className="td num">{row.reference}</td>
                  <td className="td">{row.product || <span className="text-muted">Unnamed</span>}</td>
                  <td className="td"><StatusBadge value={row.compliance_status} /></td>
                  <td className="td">{row.highest_severity || <span className="text-muted">—</span>}</td>
                  <td className="td num">{row.open_reviews}</td>
                  <td className="td text-right">
                    <Link className="btn-ghost !py-1 !text-2xs" to={`/inspections/${row.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
