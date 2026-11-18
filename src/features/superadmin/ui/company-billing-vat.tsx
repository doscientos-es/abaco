import { Button } from '@doscientos/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { billingPreviewQuery, STANDARD_BILLING_VAT } from '@/features/billing'

import { setCompanyBillingVat } from '../application/superadmin-queries'

export function CompanyBillingVat({
  tenantId,
  vatPercent,
  blocked,
}: {
  tenantId: string
  vatPercent: number
  blocked: boolean
}) {
  const [selectedVat, setSelectedVat] = useState(vatPercent)
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (vat: number) => setCompanyBillingVat(tenantId, vat),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: billingPreviewQuery(tenantId).queryKey }),
  })
  const canSave = !blocked && !update.isPending && selectedVat !== vatPercent

  return (
    <form
      className="border-border space-y-2 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) update.mutate(selectedVat)
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          IVA de la suscripción
          <select
            value={selectedVat}
            disabled={blocked || update.isPending}
            onChange={(event) => {
              update.reset()
              setSelectedVat(Number(event.currentTarget.value))
            }}
          >
            <option value={STANDARD_BILLING_VAT}>{STANDARD_BILLING_VAT} % · General</option>
            <option value={0}>0 % · Sin IVA</option>
          </select>
        </label>
        <Button type="submit" isDisabled={!canSave}>
          Guardar IVA
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Selecciona el 0 % solo si fiscalmente corresponde. Se aplica al próximo cobro; no modifica
        pagos anteriores ni los impuestos de las facturas que emite la empresa.
      </p>
      {update.error ? <p role="alert">{update.error.message}</p> : null}
    </form>
  )
}
