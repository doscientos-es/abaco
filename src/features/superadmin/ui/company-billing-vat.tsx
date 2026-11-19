import { Button, FormFeedback } from '@doscientos/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { billingPreviewQuery, STANDARD_BILLING_VAT } from '@/features/billing'

import { setCompanyBillingVat } from '../application/superadmin-queries'
import { PlatformField, PlatformSelect } from './platform-form-field'

export function CompanyBillingVat({
  tenantId,
  vatPercent,
  blocked,
}: {
  tenantId: string
  vatPercent: number
  blocked: boolean
}) {
  const titleId = useId()
  const [draft, setDraft] = useState<{ initial: number; value: number } | null>(null)
  const selectedVat = draft?.initial === vatPercent ? draft.value : vatPercent
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (vat: number) => setCompanyBillingVat(tenantId, vat),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: billingPreviewQuery(tenantId).queryKey })
      setDraft(null)
    },
  })
  const canSave = !blocked && !update.isPending && selectedVat !== vatPercent

  return (
    <form
      aria-labelledby={titleId}
      className="border-border space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) update.mutate(selectedVat)
      }}
    >
      <h4 id={titleId} className="font-semibold">
        IVA de la suscripción
      </h4>
      <PlatformField
        label="Tipo de IVA"
        className="max-w-lg"
        hint="Selecciona el 0 % solo si fiscalmente corresponde. Se aplica al próximo cobro; no modifica pagos anteriores ni las facturas que emite la empresa."
      >
        {(control) => (
          <PlatformSelect
            {...control}
            value={selectedVat}
            disabled={blocked || update.isPending}
            onChange={(event) => {
              update.reset()
              setDraft({ initial: vatPercent, value: Number(event.currentTarget.value) })
            }}
          >
            <option value={STANDARD_BILLING_VAT}>{STANDARD_BILLING_VAT} % · General</option>
            <option value={0}>0 % · Sin IVA</option>
          </PlatformSelect>
        )}
      </PlatformField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11" isDisabled={!canSave}>
          Guardar IVA
        </Button>
        {update.isPending ? <FormFeedback state={{ status: 'pending' }} /> : null}
        {update.error ? (
          <FormFeedback
            className="h-auto"
            state={{ status: 'error', message: update.error.message }}
          />
        ) : null}
        {update.isSuccess ? (
          <FormFeedback
            className="h-auto"
            state={{ status: 'success', message: 'IVA guardado para el próximo cobro.' }}
          />
        ) : null}
      </div>
    </form>
  )
}
