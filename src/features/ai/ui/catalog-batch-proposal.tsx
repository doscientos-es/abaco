import { Button } from '@doscientos/ui'
import { useRef, useState } from 'react'
import type { z } from 'zod'

import { can, useSession } from '@/features/auth'
import { centsToInput, formatEuros } from '@/shared/domain/money'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { currentTenantData, refreshStore, synchronizeStoreSaves } from '@/shared/store/store'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  applyPriceChanges,
  createMaterials,
  duplicateMaterials,
  loadCatalog,
  parseMaterialPrice,
  planPriceChanges,
  type PriceChange,
} from '../application/catalog-batch'
import { catalogCreateProposalSchema, type catalogPriceProposalSchema } from '../domain/chat-tools'

type Proposal =
  | { type: 'create'; value: z.infer<typeof catalogCreateProposalSchema> }
  | { type: 'prices'; value: z.infer<typeof catalogPriceProposalSchema> }

const kindLabels = {
  all: 'todos los tipos',
  material: 'materiales',
  labor: 'mano de obra',
  other: 'otros',
}

export function CatalogBatchProposal({
  proposal,
  tenantId,
  enabled,
  onAttempt,
}: {
  proposal: Proposal
  tenantId: string
  enabled: boolean
  onAttempt: () => void
}) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [message, setMessage] = useState('')
  const [changes, setChanges] = useState<PriceChange[]>([])
  const [prices, setPrices] = useState(() =>
    proposal.type === 'create'
      ? proposal.value.items.map((item) =>
          item.unitPriceCents === null ? '' : centsToInput(item.unitPriceCents),
        )
      : [],
  )
  const permitted = enabled && can(session?.role, 'catalog:write')

  async function review() {
    if (!permitted || running.current) return
    running.current = true
    setBusy(true)
    setMessage('')
    try {
      await synchronizeStoreSaves()
      if (currentTenantData()?.tenant.id !== tenantId)
        throw new Error('La empresa activa ha cambiado.')
      const catalog = await loadCatalog(createBrowserSupabaseClient(), tenantId)
      if (proposal.type === 'prices') setChanges(planPriceChanges(catalog, proposal.value))
      else {
        const duplicates = duplicateMaterials(proposal.value.items, catalog)
        if (duplicates.length)
          throw new Error(
            `Posibles duplicados: ${duplicates.join(', ')}. Revisa el catálogo y solicita una propuesta nueva.`,
          )
      }
      setOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo preparar la revisión.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const parsedPrices = prices.map(parseMaterialPrice)
  const validPrices = parsedPrices.every((price) => price !== null)
  async function save() {
    if (!permitted || running.current || (proposal.type === 'create' && !validPrices)) return
    running.current = true
    setBusy(true)
    setMessage('')
    let attempted = false
    try {
      await synchronizeStoreSaves()
      if (currentTenantData()?.tenant.id !== tenantId)
        throw new Error('La empresa activa ha cambiado.')
      const db = createBrowserSupabaseClient()
      if (proposal.type === 'create') {
        const parsed = catalogCreateProposalSchema.safeParse({
          items: proposal.value.items.map((item, index) => ({
            ...item,
            unitPriceCents: parsedPrices[index] ?? null,
          })),
        })
        if (!parsed.success)
          throw new Error('Revisa los precios: alguno supera el máximo permitido.')
        const duplicates = duplicateMaterials(parsed.data.items, await loadCatalog(db, tenantId))
        if (duplicates.length)
          throw new Error(
            `Posibles duplicados: ${duplicates.join(', ')}. No se ha creado ningún material.`,
          )
        attempted = true
        await createMaterials(db, tenantId, parsed.data.items)
        setMessage(`Se han creado ${parsed.data.items.length} materiales.`)
      } else {
        if (!changes.length) throw new Error('No hay artículos que coincidan con el alcance.')
        attempted = true
        const result = await applyPriceChanges(db, tenantId, changes)
        setMessage(
          result.complete
            ? `Precios actualizados: ${result.applied}.`
            : `Operación interrumpida. Confirmados: ${result.applied}. ${result.failed}: ${result.uncertain ? 'no se pudo confirmar el resultado' : 'ha cambiado o no se pudo editar'}. Comprueba el catálogo antes de continuar.`,
        )
      }
      setOpen(false)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo completar la operación. Comprueba el catálogo.',
      )
      if (attempted) setOpen(false)
    } finally {
      if (attempted) {
        onAttempt()
        await refreshStore()
      }
      running.current = false
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2 rounded-xl border p-3 text-sm">
      <p>
        {proposal.type === 'create'
          ? `Propuesta: ${proposal.value.items.length} materiales nuevos`
          : `Propuesta: variación de precios del ${proposal.value.basisPoints / 100}%`}
      </p>
      <Button
        type="button"
        variant="outline"
        isDisabled={!permitted || busy}
        onPress={() => void review()}
      >
        {busy ? 'Cargando…' : 'Revisar cambios'}
      </Button>
      {message ? <output className="block">{message}</output> : null}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={proposal.type === 'create' ? 'Revisar materiales' : 'Revisar precios'}
        description={
          proposal.type === 'create'
            ? 'Comprueba los datos y completa los precios. La comprobación de duplicados no impide creaciones simultáneas.'
            : 'Se actualizarán solo los artículos revisados. Si alguno ha cambiado, la operación se detendrá; los anteriores ya estarán guardados.'
        }
        submitLabel={proposal.type === 'create' ? 'Crear materiales' : 'Actualizar precios'}
        submitDisabled={
          !permitted || (proposal.type === 'create' ? !validPrices : changes.length === 0)
        }
        isSubmitting={busy}
        wide
        onSubmit={() => void save()}
      >
        <div className="space-y-3 sm:col-span-2">
          {proposal.type === 'create' ? (
            proposal.value.items.map((item, index) => (
              <div key={index} className="rounded border p-3">
                <p>
                  <strong>{item.name}</strong> · {item.sku || 'Sin referencia'} ·{' '}
                  {item.category || 'Sin categoría'} · {item.unit || 'ud'}
                </p>
                <TextField
                  label="Precio unitario (€)"
                  placeholder="0,00"
                  value={prices[index] ?? ''}
                  onChange={(value) =>
                    setPrices((previous) =>
                      previous.map((price, i) => (i === index ? value : price)),
                    )
                  }
                />
              </div>
            ))
          ) : (
            <>
              <p>
                {changes.length} artículos · {kindLabels[proposal.value.kind]} ·{' '}
                {proposal.value.category ?? 'todas las categorías'}
              </p>
              {changes.map(({ item, newPrice }) => (
                <p key={item.id}>
                  {item.name} {item.sku ? `(${item.sku})` : ''}: {formatEuros(item.unitPriceCents)}{' '}
                  → {formatEuros(newPrice)}
                </p>
              ))}
            </>
          )}
        </div>
        {message ? (
          <p role="alert" className="sm:col-span-2">
            {message}
          </p>
        ) : null}
      </FormDialog>
    </section>
  )
}
