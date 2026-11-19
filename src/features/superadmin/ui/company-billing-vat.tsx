import { Button } from '@doscientos/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { billingPreviewQuery, STANDARD_BILLING_VAT } from '@/features/billing'

import { setCompanyBillingVat } from '../application/superadmin-queries'
import { PlatformField, PlatformSelect } from './platform-form-field'
import { PlatformFeedback } from './platform-ui'

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
      className="border-border space-y-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) update.mutate(selectedVat)
      }}
    >
      <h4 id={titleId} className="sr-only">
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
            value={String(selectedVat)}
            isDisabled={blocked || update.isPending}
            options={[
              { id: String(STANDARD_BILLING_VAT), label: `${STANDARD_BILLING_VAT} % · General` },
              { id: '0', label: '0 % · Sin IVA' },
            ]}
            onChange={(value) => {
              update.reset()
              setDraft({ initial: vatPercent, value: Number(value) })
            }}
          />
        )}
      </PlatformField>
      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
        <Button type="submit" isDisabled={!canSave}>
          Guardar IVA
        </Button>
        <PlatformFeedback action={update} success="IVA guardado para el próximo cobro." />
      </div>
    </form>
  )
}
