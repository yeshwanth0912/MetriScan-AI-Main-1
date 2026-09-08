const TONE = {
  PASS: 'text-pass border-pass/40 bg-pass/5',
  FAIL: 'text-fail border-fail/40 bg-fail/5',
  REVIEW: 'text-review border-review/40 bg-review/5',
  NOT_APPLICABLE: 'text-na border-na/30 bg-na/5',
  COMPLIANT: 'text-pass border-pass/40 bg-pass/5',
  NON_COMPLIANT: 'text-fail border-fail/40 bg-fail/5',
  REVIEW_REQUIRED: 'text-review border-review/40 bg-review/5',
  DRAFT: 'text-na border-na/30 bg-na/5',
  ANALYZING: 'text-review border-review/40 bg-review/5',
  FINALIZED: 'text-ink border-rule bg-paper'
}

export default function StatusBadge({ value, size = 'sm' }) {
  if (!value) return <span className="text-muted">—</span>
  const pad = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-2xs'
  return (
    <span className={`inline-block rounded border font-semibold whitespace-nowrap ${pad} ${TONE[value] || TONE.NOT_APPLICABLE}`}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}
