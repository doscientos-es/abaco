import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { SelectField } from '@/shared/ui/form'

import type { ServiceContract } from '../application/contract-actions'
import {
  applyLibraryTemplate,
  loadContractTemplateLibrary,
} from '../application/contract-template-library-actions'

export function ApplyContractTemplateButton({ contract }: { contract: ServiceContract }) {
  const cache = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(contract.document_template_id ?? '')
  const library = useQuery({
    queryKey: ['contract-template-library', contract.tenant_id],
    queryFn: () => loadContractTemplateLibrary(contract.tenant_id),
  })
  const template = library.data?.templates.find((item) => item.id === selectedId)
  const operations = useRef(new Map<string, string>())
  async function apply() {
    if (busy || !template) return
    if (
      !window.confirm('Se sustituirán las secciones actuales de este borrador. ¿Quieres continuar?')
    )
      return
    const version = contract.updated_at
    const operationKey = `${version}:${template.id}:${template.revision}`
    const operationId = operations.current.get(operationKey) ?? crypto.randomUUID()
    operations.current.set(operationKey, operationId)
    setBusy(true)
    try {
      await applyLibraryTemplate({
        tenantId: contract.tenant_id,
        contractId: contract.id,
        templateId: template.id,
        templateRevision: template.revision,
        expectedUpdatedAt: version,
        operationId,
      })
      operations.current.delete(operationKey)
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
      await cache.invalidateQueries({ queryKey: ['contract-template-library', contract.tenant_id] })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Plantilla del contrato</h3>
        <p className="text-muted-foreground text-xs">
          {contract.document_template_name
            ? `Aplicada: ${contract.document_template_name}`
            : 'Sin plantilla seleccionada en la biblioteca; se conserva el contenido anterior.'}
        </p>
      </div>
      {library.isPending ? <output>Cargando plantillas…</output> : null}
      {library.isError ? <p role="alert">No se pudieron cargar las plantillas.</p> : null}
      {library.data?.templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Crea una plantilla en Contratos → Plantillas.
        </p>
      ) : null}
      {library.data?.templates.length ? (
        <SelectField
          label="Seleccionar plantilla"
          value={selectedId}
          onChange={setSelectedId}
          isDisabled={busy}
          placeholder="Selecciona una plantilla"
          options={library.data.templates.map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : null}
      <Button variant="outline" isDisabled={busy || !template} onPress={() => void apply()}>
        {busy ? 'Aplicando…' : 'Aplicar plantilla'}
      </Button>
      <p className="text-muted-foreground text-xs">
        El contrato guarda una copia; los cambios posteriores en la biblioteca no lo modifican.
      </p>
    </div>
  )
}
