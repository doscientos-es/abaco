import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import type { ServiceContract } from '../application/contract-actions'
import { applyContractDocumentTemplate } from '../application/contract-document-template-actions'

export function ApplyContractTemplateButton({ contract }: { contract: ServiceContract }) {
  const cache = useQueryClient()
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  async function apply() {
    if (busy) return
    const version = contract.updated_at
    const operationId = operations.current.get(version) ?? crypto.randomUUID()
    operations.current.set(version, operationId)
    setBusy(true)
    try {
      await applyContractDocumentTemplate({
        tenantId: contract.tenant_id,
        contractId: contract.id,
        expectedUpdatedAt: version,
        operationId,
      })
      operations.current.delete(version)
      await cache.invalidateQueries({
        queryKey: ['service-contract', contract.tenant_id, contract.id],
      })
      toast.success('Plantilla aplicada al borrador')
    } catch (error) {
      toast.error('No se pudo aplicar la plantilla', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await cache.invalidateQueries({
        queryKey: ['service-contract', contract.tenant_id, contract.id],
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1">
      <Button variant="outline" isDisabled={busy} onPress={() => void apply()}>
        {busy ? 'Actualizando…' : 'Actualizar con la plantilla actual'}
      </Button>
      <p className="text-muted-foreground text-xs">
        Sustituye las secciones comunes de este borrador por las de la plantilla vigente.
      </p>
    </div>
  )
}
