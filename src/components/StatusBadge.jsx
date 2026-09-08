import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, ShieldCheck, FileEdit, Clock, Loader2 } from 'lucide-react'

const BADGE_CONFIG = {
  PASS: {
    cls: 'text-emerald-700 bg-emerald-50/90 border-emerald-200/80',
    icon: CheckCircle2,
    label: 'PASS'
  },
  COMPLIANT: {
    cls: 'text-emerald-700 bg-emerald-50/90 border-emerald-200/80',
    icon: CheckCircle2,
    label: 'COMPLIANT'
  },
  FAIL: {
    cls: 'text-red-700 bg-red-50/90 border-red-200/80',
    icon: XCircle,
    label: 'FAIL'
  },
  NON_COMPLIANT: {
    cls: 'text-red-700 bg-red-50/90 border-red-200/80',
    icon: XCircle,
    label: 'NON-COMPLIANT'
  },
  REVIEW: {
    cls: 'text-amber-800 bg-amber-50/90 border-amber-200/80',
    icon: AlertTriangle,
    label: 'REVIEW'
  },
  REVIEW_REQUIRED: {
    cls: 'text-amber-800 bg-amber-50/90 border-amber-200/80',
    icon: AlertTriangle,
    label: 'REVIEW REQUIRED'
  },
  NOT_APPLICABLE: {
    cls: 'text-slate-600 bg-slate-100 border-slate-200',
    icon: MinusCircle,
    label: 'NOT APPLICABLE'
  },
  DRAFT: {
    cls: 'text-slate-600 bg-slate-100 border-slate-200',
    icon: FileEdit,
    label: 'DRAFT'
  },
  ANALYZING: {
    cls: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    icon: Loader2,
    label: 'ANALYZING',
    spin: true
  },
  FINALIZED: {
    cls: 'text-slate-900 bg-slate-100/90 border-slate-300 font-semibold',
    icon: ShieldCheck,
    label: 'FINALIZED'
  }
}

export default function StatusBadge({ value, size = 'sm', showIcon = true }) {
  if (!value) return <span className="text-muted text-xs">—</span>
  const conf = BADGE_CONFIG[value] || {
    cls: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: MinusCircle,
    label: value.replace(/_/g, ' ')
  }

  const Icon = conf.icon
  const isLg = size === 'lg'
  const pad = isLg ? 'px-3 py-1 text-xs gap-1.5' : 'px-2 py-0.5 text-2xs gap-1'
  const iconSize = isLg ? 'w-3.5 h-3.5' : 'w-3 h-3'

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors ${pad} ${conf.cls}`}
    >
      {showIcon && Icon && (
        <Icon className={`${iconSize} shrink-0 ${conf.spin ? 'animate-spin' : ''}`} />
      )}
      <span>{conf.label}</span>
    </span>
  )
}

