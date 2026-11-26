import { toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { CatalogItem } from '@/shared/domain/types'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { listSuppliers, saveInventory, type InventoryItem } from '../application/inventory-actions'

export function InventoryDialog({
  item,
  stock,
  onClose,
  initialQuantity,
  onSaved,
}: {
  item: CatalogItem
  stock: InventoryItem | undefined
  onClose: () => void
  initialQuantity?: number
  onSaved?: () => void
}) {
  const queryClient = useQueryClient()
  const suppliers = useQuery({
    queryKey: ['suppliers', item.tenantId],
    queryFn: () => listSuppliers(item.tenantId),
  })
  const [quantity, setQuantity] = useState(String(initialQuantity ?? stock?.quantity ?? 0))
  const [supplierId, setSupplierId] = useState(stock?.supplier_id ?? '')
  const [expectedVersion] = useState(stock?.version ?? null)
  const [saving, setSaving] = useState(false)
  const parsed = Number(quantity.replace(',', '.'))
  const valid = /^\d+(?:[.,]\d{1,3})?$/.test(quantity.trim()) && parsed <= 999999999.999

  async function save() {
    if (!valid || saving || !suppliers.isSuccess) return
    setSaving(true)
    try {
      await saveInventory({
        tenantId: item.tenantId,
        catalogItemId: item.id,
        quantity: parsed,
        supplierId: supplierId || null,
        expectedVersion,
      })
      await queryClient.invalidateQueries({ queryKey: ['inventory', item.tenantId] })
      onSaved?.()
      onClose()
      toast.success('Stock actualizado')
    } catch (error) {
      toast.error('No se pudo guardar el stock', {
        description: `${error instanceof Error ? error.message : 'Inténtalo de nuevo.'} Cierra y vuelve a abrir el formulario para consultar el stock actual.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['inventory', item.tenantId] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Stock · ${item.name}`}
      description={
        initialQuantity === undefined
          ? 'Al aceptar un presupuesto se descontará la cantidad disponible.'
          : `Stock actual: ${stock ? `${stock.quantity} ${item.unit}` : 'sin controlar'}. Revisa la cantidad propuesta antes de guardar.`
      }
      submitLabel="Guardar stock"
      submitDisabled={!valid || !suppliers.isSuccess}
      isSubmitting={saving}
      onSubmit={() => void save()}
    >
      <TextField
        label={`Cantidad disponible (${item.unit})`}
        placeholder="0"
        value={quantity}
        onChange={setQuantity}
        helper="Hasta tres decimales."
      />
      <SelectField
        label="Proveedor"
        value={supplierId}
        onChange={setSupplierId}
        options={[
          { value: '', label: 'Sin proveedor' },
          ...(suppliers.data ?? []).map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
          })),
        ]}
      />
      {suppliers.isError ? <p role="alert">No se pudieron cargar los proveedores.</p> : null}
    </FormDialog>
  )
}
