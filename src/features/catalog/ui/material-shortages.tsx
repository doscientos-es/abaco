import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  toast,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useModuleEnabled } from '@/features/product-modules'
import { useTenantData } from '@/shared/store/store'

import {
  listInventory,
  listShortages,
  listSuppliers,
  resolveShortage,
} from '../application/inventory-actions'
import { supplierOrderMailto, supplierPhoneHref } from '../domain/supplier-order'

/** Pending shortages are durable: opening an email does not claim that it was sent. */
export function MaterialShortages({ estimateId }: { estimateId?: string }) {
  const { tenant } = useTenantData()
  const procurement = useModuleEnabled(tenant.id, 'procurement')
  return procurement ? <EnabledMaterialShortages estimateId={estimateId} /> : null
}

function EnabledMaterialShortages({ estimateId }: { estimateId: string | undefined }) {
  const { tenant, estimates } = useTenantData()
  const queryClient = useQueryClient()
  const shortages = useQuery({
    queryKey: ['inventory-shortages', tenant.id, estimateId ?? 'all'],
    queryFn: () => listShortages(tenant.id, estimateId),
    refetchInterval: 60_000,
  })
  const suppliers = useQuery({
    queryKey: ['suppliers', tenant.id],
    queryFn: () => listSuppliers(tenant.id),
  })
  const inventory = useQuery({
    queryKey: ['inventory', tenant.id],
    queryFn: () => listInventory(tenant.id),
  })

  async function resolve(id: string) {
    try {
      await resolveShortage(tenant.id, id)
      await queryClient.invalidateQueries({ queryKey: ['inventory-shortages', tenant.id] })
      toast.success('Faltante marcado como gestionado')
    } catch (error) {
      toast.error('No se pudo actualizar el faltante', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    }
  }

  if (shortages.isPending || suppliers.isPending || inventory.isPending)
    return <p>Cargando faltantes…</p>
  if (shortages.isError || suppliers.isError || inventory.isError)
    return <p role="alert">No se pudieron cargar los faltantes de material.</p>
  if (!shortages.data?.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material pendiente de gestionar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Se ha descontado el stock disponible al aceptar. Puedes contactar al proveedor; Ábaco no
          envía ni confirma el pedido por ti.
        </p>
        <ul className="divide-y">
          {shortages.data.map((shortage) => {
            const supplierId =
              shortage.supplier_id ??
              inventory.data?.find((item) => item.catalog_item_id === shortage.catalog_item_id)
                ?.supplier_id
            const supplier = suppliers.data?.find((item) => item.id === supplierId)
            const estimate = estimates.find((item) => item.id === shortage.estimate_id)
            const phone =
              shortage.reason === 'insufficient' && supplier
                ? supplierPhoneHref(supplier.phone)
                : null
            const mailto =
              shortage.reason === 'insufficient' && supplier && estimate
                ? supplierOrderMailto({
                    email: supplier.email,
                    supplierName: supplier.name,
                    companyName: tenant.name,
                    estimateNumber: estimate.number,
                    lines: [
                      {
                        name: shortage.name,
                        sku: shortage.sku,
                        unit: shortage.unit,
                        missingQuantity: shortage.missing_quantity,
                      },
                    ],
                  })
                : null
            return (
              <li
                key={shortage.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {shortage.name}: faltan {shortage.missing_quantity.toLocaleString('es-ES')}{' '}
                    {shortage.unit}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {estimate?.number ?? 'Presupuesto'} ·{' '}
                    {supplier ? supplier.name : 'Sin proveedor asignado'}
                    {shortage.reason === 'unit_mismatch'
                      ? ' · La unidad del presupuesto no coincide con la del inventario; revisa el material antes de pedirlo.'
                      : supplier && !mailto && estimate
                        ? ' · Sin correo válido'
                        : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {phone ? (
                    <a className={buttonVariants({ variant: 'outline' })} href={phone}>
                      Llamar al proveedor
                    </a>
                  ) : null}
                  {mailto ? (
                    <a className={buttonVariants({ variant: 'outline' })} href={mailto}>
                      Preparar correo
                    </a>
                  ) : null}
                  <Button variant="outline" onPress={() => void resolve(shortage.id)}>
                    Marcar gestionado
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
