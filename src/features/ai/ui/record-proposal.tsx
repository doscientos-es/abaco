import { Button } from '@doscientos/ui'
import { useState } from 'react'
import type { z } from 'zod'

import { can, useSession } from '@/features/auth'
import type { InventoryItem } from '@/features/catalog/application/inventory-actions'
import { InventoryDialog } from '@/features/catalog/ui/inventory-dialog'
import type { ClientInput } from '@/features/clients/application/client-actions'
import { ClientFormDialog } from '@/features/clients/ui/client-form-dialog'
import type { CatalogItem, Client } from '@/shared/domain/types'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { currentTenantData, refreshStore, synchronizeStoreSaves } from '@/shared/store/store'
import { catalogFromRow, clientFromRow } from '@/shared/store/supabase-mappers'

import type { clientEditProposalSchema, inventoryProposalSchema } from '../domain/chat-tools'
import { ChatProposal } from './chat-presentation'

type Proposal =
  | { type: 'cliente'; value: z.infer<typeof clientEditProposalSchema> }
  | { type: 'stock'; value: z.infer<typeof inventoryProposalSchema> }

export function RecordProposal({
  proposal,
  tenantId,
  enabled,
  onSaved,
}: {
  proposal: Proposal
  tenantId: string
  enabled: boolean
  onSaved: () => void
}) {
  const session = useSession()
  const [client, setClient] = useState<Client | null>(null)
  const [stock, setStock] = useState<{
    item: CatalogItem
    stock: InventoryItem | undefined
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const permitted =
    enabled && can(session?.role, proposal.type === 'cliente' ? 'clients:write' : 'catalog:write')

  async function review() {
    if (!permitted || loading) return
    setLoading(true)
    setError('')
    try {
      const db = createBrowserSupabaseClient()
      if (proposal.type === 'cliente') {
        await synchronizeStoreSaves()
        await refreshStore()
        const result = await db
          .from('clients')
          .select(
            'id,tenant_id,name,kind,tax_id,email,phone,address,billing_address,archived_at,notes',
          )
          .eq('tenant_id', tenantId)
          .eq('id', proposal.value.clientId)
          .is('archived_at', null)
          .maybeSingle()
        if (result.error || !result.data) throw new Error('No se pudo cargar el cliente actual.')
        const fresh = clientFromRow(result.data)
        const current = currentTenantData()
        const stored = current?.clients.find((item) => item.id === fresh.id)
        if (current?.tenant.id !== tenantId || JSON.stringify(stored) !== JSON.stringify(fresh))
          throw new Error('Los datos han cambiado. Recarga la página antes de editar.')
        setClient(fresh)
      } else {
        const [item, inventory] = await Promise.all([
          db
            .from('catalog_items')
            .select('id,tenant_id,name,sku,kind,category,unit,unit_price_cents')
            .eq('tenant_id', tenantId)
            .eq('id', proposal.value.catalogItemId)
            .eq('kind', 'material')
            .maybeSingle(),
          db
            .from('inventory_items')
            .select('catalog_item_id,quantity,supplier_id,version')
            .eq('tenant_id', tenantId)
            .eq('catalog_item_id', proposal.value.catalogItemId)
            .maybeSingle(),
        ])
        if (item.error || !item.data || inventory.error)
          throw new Error('No se pudo cargar el stock actual.')
        setStock({
          item: catalogFromRow(item.data),
          stock: (inventory.data as InventoryItem | undefined) ?? undefined,
        })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el formulario.')
    } finally {
      setLoading(false)
    }
  }

  const values: Partial<ClientInput> =
    proposal.type === 'cliente'
      ? Object.fromEntries(
          Object.entries(proposal.value).filter(
            ([key, value]) => key !== 'clientId' && value !== null,
          ),
        )
      : {}
  return (
    <ChatProposal title={proposal.type === 'cliente' ? 'Editar cliente' : 'Actualizar stock'}>
      <p className="text-muted-foreground">
        {proposal.type === 'cliente'
          ? 'Revisa los datos propuestos antes de guardar.'
          : `Cantidad propuesta: ${proposal.value.quantity}`}
      </p>
      <Button
        type="button"
        variant="outline"
        isDisabled={!permitted || loading}
        onPress={() => void review()}
      >
        {loading ? 'Cargando…' : 'Revisar formulario'}
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {client && proposal.type === 'cliente' ? (
        <ClientFormDialog
          open
          client={client}
          initialValues={values}
          onClose={() => setClient(null)}
          onSaved={onSaved}
        />
      ) : null}
      {stock && proposal.type === 'stock' ? (
        <InventoryDialog
          item={stock.item}
          stock={stock.stock}
          initialQuantity={proposal.value.quantity}
          onClose={() => setStock(null)}
          onSaved={onSaved}
        />
      ) : null}
    </ChatProposal>
  )
}
