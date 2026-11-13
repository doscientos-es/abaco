import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { FormDialog } from '@/shared/ui/form-dialog'

import type { ServiceContract } from '../application/contract-actions'
import { recordContractSignature } from '../application/contract-signature-actions'

export function ContractSignatureDialog({
  contract,
  onClose,
}: {
  contract: ServiceContract
  onClose: () => void
}) {
  const session = useSession()
  const queryClient = useQueryClient()
  const inputId = useId()
  const operation = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signed = Boolean(contract.signed_at)
  const allowed = session?.tenantId === contract.tenant_id && can(session?.role, 'contracts:write')

  async function submit() {
    if (!allowed || saving.current || (signed && !file)) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      await recordContractSignature({
        tenantId: contract.tenant_id,
        contractId: contract.id,
        expectedUpdatedAt: contract.updated_at,
        operationId: operation.current,
        file,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la firma.')
      saving.current = false
      setBusy(false)
      return
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['service-contracts', contract.tenant_id] }),
      queryClient.invalidateQueries({
        queryKey: ['service-contract', contract.tenant_id, contract.id],
      }),
    ]).catch(() => undefined)
    onClose()
  }

  return (
    <FormDialog
      open={allowed}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={signed ? 'Adjuntar PDF firmado' : 'Marcar como firmado'}
      description={contract.title}
      submitLabel={busy ? 'Guardando…' : signed ? 'Adjuntar PDF' : 'Marcar como firmado'}
      submitDisabled={!allowed || (signed && !file)}
      isSubmitting={busy}
      isDirty={Boolean(file)}
      onSubmit={() => void submit()}
    >
      <div className="space-y-3 sm:col-span-2">
        <p className="text-muted-foreground text-sm">
          La firma se registra sin activar el contrato ni generar trabajos.
          {!signed ? ' Puedes adjuntar ahora el PDF firmado en papel o añadirlo más adelante.' : ''}
        </p>
        <label htmlFor={inputId} className="block text-sm font-medium">
          PDF firmado{signed ? '' : ' (opcional)'}
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            operation.current = crypto.randomUUID()
            setError(null)
          }}
          className="border-border block w-full rounded-md border p-2 text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Solo PDF, hasta 15 MB. El documento queda privado y no se puede sustituir.
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </FormDialog>
  )
}
