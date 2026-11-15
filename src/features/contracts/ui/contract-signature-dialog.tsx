import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { FormDialog } from '@/shared/ui/form-dialog'

import type { ServiceContract } from '../application/contract-actions'
import {
  loadContractSignatureSetup,
  recordContractSignature,
} from '../application/contract-signature-actions'
import {
  contractAssignmentError,
  initialContractAssignments,
  resolveContractAssignments,
  type ContractAssignmentDraft,
} from '../domain/contract-task-assignment'
import { ContractAssignmentEditor } from './contract-assignment-editor'

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
  const [drafts, setDrafts] = useState<ContractAssignmentDraft[] | null>(null)
  const signed = Boolean(contract.signed_at)
  const allowed = session?.tenantId === contract.tenant_id && can(session?.role, 'contracts:write')
  const setup = useQuery({
    queryKey: ['contract-assignment-setup', contract.tenant_id, contract.id],
    queryFn: () => loadContractSignatureSetup(contract.tenant_id, contract.id),
    enabled: allowed && !signed,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  const currentDrafts =
    drafts ?? (setup.data ? initialContractAssignments(setup.data, contract.starts_on) : [])
  const assignmentError = !signed
    ? setup.data && !setup.isFetching && !setup.isError
      ? contractAssignmentError(setup.data, currentDrafts)
      : 'Carga los trabajos y las tareas antes de firmar.'
    : null

  async function submit() {
    if (!allowed || saving.current || (signed && !file) || assignmentError) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      await recordContractSignature({
        tenantId: contract.tenant_id,
        contractId: contract.id,
        expectedUpdatedAt: !signed && setup.data ? setup.data.updated_at : contract.updated_at,
        operationId: operation.current,
        file,
        ...(!signed ? { assignments: resolveContractAssignments(currentDrafts) } : {}),
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
        queryKey: ['contract-assignment-setup', contract.tenant_id, contract.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['cleaning-services', contract.tenant_id, contract.id],
      }),
      queryClient.invalidateQueries({ queryKey: ['contract-jobs', contract.tenant_id] }),
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
      wide={!signed}
      submitLabel={busy ? 'Guardando…' : signed ? 'Adjuntar PDF' : 'Marcar como firmado'}
      submitDisabled={!allowed || (signed && !file) || Boolean(assignmentError)}
      isSubmitting={busy}
      isDirty={Boolean(file) || Boolean(drafts)}
      onSubmit={() => void submit()}
    >
      <div className="space-y-3 sm:col-span-2">
        <p className="text-muted-foreground text-sm">
          La firma se registra sin activar el contrato ni programar visitas.
          {!signed ? ' Puedes adjuntar ahora el PDF firmado en papel o añadirlo más adelante.' : ''}
        </p>
        {!signed && setup.isPending ? (
          <output>Cargando trabajos y tareas del presupuesto…</output>
        ) : null}
        {!signed && setup.isError ? (
          <div role="alert" className="space-y-2">
            <p>No se pudieron cargar las tareas: {setup.error.message}</p>
            <Button variant="outline" onPress={() => void setup.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {!signed && setup.data ? (
          <ContractAssignmentEditor
            setup={setup.data}
            drafts={currentDrafts}
            disabled={busy}
            onChange={(next) => {
              setDrafts(next)
              operation.current = crypto.randomUUID()
              setError(null)
            }}
          />
        ) : null}
        {!signed && setup.data && assignmentError ? (
          <p className="text-muted-foreground text-sm">{assignmentError}</p>
        ) : null}
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
          <div className="space-y-2">
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
            {!signed ? (
              <Button
                variant="outline"
                isDisabled={busy || setup.isFetching}
                onPress={() => {
                  setDrafts(null)
                  operation.current = crypto.randomUUID()
                  setError(null)
                  void setup.refetch()
                }}
              >
                Recargar trabajos y tareas
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </FormDialog>
  )
}
