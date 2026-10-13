import { Input } from '@doscientos/ui'
import { useState } from 'react'

import { centsToInput, parseEuros } from '@/shared/domain/money'

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
      inputMode="decimal"
      className="text-right tabular-nums"
      value={draft ?? centsToInput(cents)}
      onFocus={() => setDraft(centsToInput(cents))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(parseEuros(draft))
        setDraft(null)
      }}
    />
  )
}
