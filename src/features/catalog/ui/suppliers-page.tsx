import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useTenantData } from '@/shared/store/store'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { WorkspacePageHeading } from '@/shared/ui/workspace-page-chrome'

import { listSuppliers, saveSupplier, type Supplier } from '../application/inventory-actions'
import { isSupplierEmail } from '../domain/supplier-order'

export function SuppliersPage() {
  const { tenant } = useTenantData()
  const queryClient = useQueryClient()
  const suppliers = useQuery({
    queryKey: ['suppliers', tenant.id],
    queryFn: () => listSuppliers(tenant.id),
  })
  const [form, setForm] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)
  const valid = Boolean(form?.name.trim() && (!form.email.trim() || isSupplierEmail(form.email)))

  async function save() {
    if (!form || !valid || saving) return
    setSaving(true)
    try {
      await saveSupplier({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      await queryClient.invalidateQueries({ queryKey: ['suppliers', tenant.id] })
      setForm(null)
      toast.success('Proveedor guardado')
    } catch (error) {
      toast.error('No se pudo guardar el proveedor', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <WorkspacePageHeading
        title="Proveedores"
        actions={
          <Button
            onPress={() =>
              setForm({
                id: crypto.randomUUID(),
                tenant_id: tenant.id,
                name: '',
                email: '',
                phone: '',
              })
            }
          >
            Nuevo proveedor
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm">
        Asigna proveedores a tus materiales para preparar solicitudes cuando falte stock.
      </p>
      {suppliers.isPending ? <p>Cargando proveedores…</p> : null}
      {suppliers.isError ? (
        <p role="alert">No se pudieron cargar los proveedores: {suppliers.error.message}</p>
      ) : null}
      {suppliers.data?.length === 0 ? <p>Aún no hay proveedores.</p> : null}
      <ul className="divide-y rounded-lg border">
        {suppliers.data?.map((supplier) => (
          <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{supplier.name}</p>
              <p className="text-muted-foreground text-sm">
                {[supplier.email || 'Sin correo', supplier.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button variant="outline" onPress={() => setForm(supplier)}>
              Editar
            </Button>
          </li>
        ))}
      </ul>
      <FormDialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null)
        }}
        title="Proveedor"
        description="El correo se usará para preparar solicitudes de material."
        submitLabel="Guardar"
        submitDisabled={!valid}
        isSubmitting={saving}
        onSubmit={() => void save()}
      >
        <TextField
          label="Nombre"
          placeholder="Nombre del proveedor"
          required
          maxLength={160}
          value={form?.name ?? ''}
          onChange={(name) => setForm((old) => (old ? { ...old, name } : old))}
        />
        <TextField
          label="Correo electrónico"
          type="email"
          placeholder="compras@proveedor.com"
          maxLength={254}
          value={form?.email ?? ''}
          onChange={(email) => setForm((old) => (old ? { ...old, email } : old))}
        />
        <TextField
          label="Teléfono"
          placeholder="Opcional"
          maxLength={50}
          value={form?.phone ?? ''}
          onChange={(phone) => setForm((old) => (old ? { ...old, phone } : old))}
        />
      </FormDialog>
    </div>
  )
}
