import { Input } from '@doscientos/ui'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import { centsToInput, parseEuros } from '@/shared/domain/money'

const maxCents = formLimits.monetaryAmount * 100

/** Euro input that keeps the raw text while typing and commits cents on blur. */
export function PriceInput({
  cents,
  onCommit,
  label,
}: {
  cents: number
  onCommit: (cents: number) => void
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      aria-label={label}
      maxLength={18}
      inputMode="decimal"
      className="text-right tabular-nums"
      value={draft ?? centsToInput(cents)}
      onFocus={() => setDraft(centsToInput(cents))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(Math.min(maxCents, Math.max(0, parseEuros(draft))))
        setDraft(null)
      }}
    />
  )
}
