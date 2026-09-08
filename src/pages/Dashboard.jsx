import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart
} from 'recharts'
import {
  ClipboardCheck,
  CheckCircle2,
  AlertOctagon,
  Clock4,
  Zap,
  Percent,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Package,
  Layers,
  Sparkles,
  ShieldCheck
} from 'lucide-react'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'

function MetricCard({ label, value, icon: Icon, tone = 'slate', subtitle, progress }) {
  const colorMap = {
    slate: {
      bg: 'bg-white',
      border: 'border-slate-200/80',
      iconBg: 'bg-slate-100 text-slate-700',
      val: 'text-slate-900',
      bar: 'bg-slate-900'
    },
    emerald: {
      bg: 'bg-white hover:border-emerald-200',
      border: 'border-slate-200/80',
      iconBg: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
      val: 'text-emerald-700',
      bar: 'bg-emerald-500'
    },
    red: {
      bg: 'bg-white hover:border-red-200',
      border: 'border-slate-200/80',
      iconBg: 'bg-red-50 text-red-700 border border-red-100',
      val: 'text-red-700',
      bar: 'bg-red-500'
    },
    amber: {
      bg: 'bg-white hover:border-amber-200',
      border: 'border-slate-200/80',
      iconBg: 'bg-amber-50 text-amber-700 border border-amber-100',
      val: 'text-amber-700',
      bar: 'bg-amber-500'
    },
    indigo: {
      bg: 'bg-white hover:border-indigo-200',
      border: 'border-slate-200/80',
      iconBg: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
      val: 'text-indigo-900',
      bar: 'bg-indigo-500'
    }
  }

  const c = colorMap[tone] || colorMap.slate

  return (
    <div className={`p-3.5 rounded-xl border ${c.border} ${c.bg} shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between group`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div>
        <div className={`num text-2xl font-bold tracking-tight ${c.val}`}>{value}</div>
        {progress != null ? (
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            {subtitle && <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>}
          </div>
        ) : subtitle ? (
          <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>
        ) : null}
      </div>
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
  if (!data.summary) {
    return (
      <div className="panel p-12 text-center">
        <div className="inline-flex p-3 rounded-full bg-slate-100 text-slate-600 mb-3 animate-spin">
          <Clock4 className="w-5 h-5" />
        </div>
        <div className="text-sm font-medium text-slate-700">Loading inspection statistics…</div>
      </div>
    )
  }

  const s = data.summary
  const ratePct = s.compliance_rate == null ? 0 : Math.round(s.compliance_rate * 100)
  const rate = s.compliance_rate == null ? '—' : `${ratePct}%`

  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Action */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 tracking-wider uppercase">
              Operational Studio
            </span>
            <span className="text-xs text-slate-300">LMPC Rules 2011 / 2026 Engine</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Legal Metrology Compliance Monitor</h1>
          <p className="text-xs text-slate-300 max-w-xl">
            Audit packaged commodity declarations, measure minimum character heights, and resolve regulatory discrepancies with verifiable visual evidence.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/inspections/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Pack Inspection</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Audited"
          value={s.total_inspections}
          icon={ClipboardCheck}
          tone="slate"
          subtitle="All recorded inspections"
        />
        <MetricCard
          label="Compliant"
          value={s.compliant}
          icon={CheckCircle2}
          tone="emerald"
          subtitle="Passed all rules"
        />
        <MetricCard
          label="Violations"
          value={s.non_compliant}
          icon={AlertOctagon}
          tone="red"
          subtitle="Non-compliant packs"
        />
        <MetricCard
          label="In Review"
          value={s.review_pending}
          icon={Clock4}
          tone="amber"
          subtitle="Awaiting manual sign-off"
        />
        <MetricCard
          label="Compliance Rate"
          value={rate}
          icon={Percent}
          tone={ratePct >= 80 ? 'emerald' : ratePct >= 50 ? 'amber' : 'red'}
          progress={ratePct}
          subtitle="Overall pass ratio"
        />
        <MetricCard
          label="Avg Analysis"
          value={s.average_analysis_ms ? `${s.average_analysis_ms} ms` : '—'}
          icon={Zap}
          tone="indigo"
          subtitle="Machine processing time"
        />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="panel p-4 lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-rule/60 mb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                Inspection Trends (Last 30 Days)
              </h2>
              <p className="text-[11px] text-slate-500">Distribution of compliance verdicts over time</p>
            </div>
            <div className="flex items-center gap-3 text-2xs font-medium">
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Compliant
              </span>
              <span className="flex items-center gap-1 text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Non-compliant
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Review
              </span>
            </div>
          </div>

          {data.trends.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              No inspections recorded in this period yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.trends} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="compliantGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    borderColor: '#E2E8F0',
                    fontSize: '11px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)'
                  }}
                />
                <Area type="monotone" dataKey="COMPLIANT" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#compliantGrad)" />
                <Area type="monotone" dataKey="NON_COMPLIANT" stroke="#DC2626" strokeWidth={2} fillOpacity={1} fill="url(#failGrad)" />
                <Line type="monotone" dataKey="REVIEW_REQUIRED" stroke="#D97706" strokeWidth={2} dot={false} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel p-4 flex flex-col justify-between">
          <div className="pb-3 border-b border-rule/60 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              Frequent Rule Breaches
            </h2>
            <p className="text-[11px] text-slate-500">Most triggered non-compliance rules</p>
          </div>

          {data.violations.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              Zero violations recorded. All packages clean!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.violations} layout="vertical" margin={{ left: -10, right: 10, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                <YAxis type="category" dataKey="rule_code" width={78} tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    borderColor: '#E2E8F0',
                    fontSize: '11px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)'
                  }}
                  formatter={(v, n, p) => [v, p.payload.title]}
                />
                <Bar dataKey="count" fill="#DC2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* Review Queue */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-rule/60 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Manual Review Queue
            </h2>
            <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-100 text-amber-800">
              {data.queue.length} pending
            </span>
          </div>
          <span className="text-[11px] text-slate-500">Requires officer or reviewer validation</span>
        </div>

        {data.queue.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
            <p className="text-xs font-medium text-slate-700">Queue is clear</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Every analyzed inspection has established declarations or is already finalized.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Product & Brand</th>
                  <th className="th">Compliance</th>
                  <th className="th">Highest Severity</th>
                  <th className="th">Discrepancies</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="td num font-semibold text-slate-800">
                      <Link to={`/inspections/${row.id}`} className="hover:text-indigo-600 underline decoration-slate-300">
                        {row.reference}
                      </Link>
                    </td>
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {row.product || <span className="text-slate-400 italic">Unnamed commodity</span>}
                      </div>
                    </td>
                    <td className="td">
                      <StatusBadge value={row.compliance_status} />
                    </td>
                    <td className="td">
                      {row.highest_severity ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold ${
                          row.highest_severity === 'HIGH'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {row.highest_severity}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-2xs">—</span>
                      )}
                    </td>
                    <td className="td num">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                        {row.open_reviews}
                      </span>
                    </td>
                    <td className="td text-right">
                      <Link
                        className="btn !py-1 !px-2.5 !text-2xs bg-slate-900 hover:bg-indigo-600 inline-flex items-center gap-1"
                        to={`/inspections/${row.id}`}
                      >
                        <span>Audit Pack</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
