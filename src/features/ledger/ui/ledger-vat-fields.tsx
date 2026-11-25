import { Button } from '@doscientos/ui'

import type { LedgerVatInput } from '@/shared/domain/ledger-vat'
import { TextField } from '@/shared/ui/form'

export function LedgerVatFields({
  lines,
  onChange,
}: {
  lines: LedgerVatInput[]
  onChange: (lines: LedgerVatInput[]) => void
}) {
  function change(index: number, key: keyof LedgerVatInput, value: string) {
    onChange(lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)))
  }
  return (
    <section className="space-y-3 sm:col-span-2" aria-label="Desglose de IVA">
      <p className="text-sm font-medium">Desglose de IVA</p>
      <p className="text-muted-foreground text-xs">
        Introduce las bases y cuotas del documento. Su suma debe coincidir con el total.
      </p>
      {lines.map((line, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-3">
          <TextField
            label={`Base ${index + 1} (€)`}
            placeholder="0,00"
            value={line.base}
            onChange={(v) => change(index, 'base', v)}
          />
          <TextField
            label={`IVA ${index + 1} (%)`}
            placeholder="21"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={line.rate}
            onChange={(v) => change(index, 'rate', v)}
          />
          <TextField
            label={`Cuota ${index + 1} (€)`}
            placeholder="0,00"
            value={line.vat}
            onChange={(v) => change(index, 'vat', v)}
          />
          {lines.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => onChange(lines.filter((_, i) => i !== index))}
            >
              Quitar tipo {index + 1}
            </Button>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={lines.length >= 20}
          onPress={() => onChange([...lines, { rate: '', base: '', vat: '' }])}
        >
          Añadir tipo de IVA
        </Button>
        <Button type="button" variant="ghost" size="sm" onPress={() => onChange([])}>
          Usar un solo tipo
        </Button>
      </div>
    </section>
  )
}
