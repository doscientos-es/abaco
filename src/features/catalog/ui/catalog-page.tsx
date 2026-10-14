import {
  Badge,
  Button,
  ConfirmDialog,
  FilterBar,
  Input,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { centsToInput, formatEuros, parseEuros } from '@/shared/domain/money'
import type { CatalogItem, CatalogKind } from '@/shared/domain/types'
import { newId, updateTenantData, useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { ImportDialog } from '@/shared/ui/import-dialog'
import { EmptyPanel } from '@/shared/ui/page-states'
import { TableRowActions } from '@/shared/ui/table-row-actions'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { catalogImportSchema, catalogKeys } from '../application/catalog-import'

const kindLabels: Record<CatalogKind, string> = {
  material: 'Material',
  labor: 'Mano de obra',
  other: 'Otros',
}

const kindOptions = Object.entries(kindLabels).map(([value, label]) => ({ value, label }))

const empty = {
  sku: '',
  name: '',
  kind: 'material' as CatalogKind,
  category: '',
  unit: 'ud',
  price: '',
}

export function CatalogPage() {
  const { catalog, tenant } = useTenantData()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | CatalogKind>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(empty)
  const [toDelete, setToDelete] = useState<CatalogItem | null>(null)

  const [categoryFilter, setCategoryFilter] = useState('all')
  const categories = [...new Set(catalog.map((item) => item.category).filter(Boolean))].sort()

  const visible = catalog.filter(
    (item) =>
      (kindFilter === 'all' || item.kind === kindFilter) &&
      (categoryFilter === 'all' || item.category === categoryFilter) &&
      fuzzySearch(query, item.sku, item.name, item.category, item.kind, item.unit),
  )
  const pager = usePagination(visible, `${query}|${kindFilter}|${categoryFilter}`)

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function reset() {
    setDialogOpen(false)
    setForm(empty)
    setEditingId(null)
  }

  function create() {
    setForm(empty)
    setEditingId(null)
    setDialogOpen(true)
  }

  function save() {
    const priceCents = parseEuros(form.price)
    if (
      !form.name.trim() ||
      form.name.trim().length > formLimits.catalogName ||
      form.sku.trim().length > formLimits.sku ||
      form.category.trim().length > formLimits.category ||
      form.unit.trim().length > formLimits.unit ||
      priceCents < 0 ||
      priceCents > formLimits.monetaryAmount * 100
    )
      return
    const values = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      kind: form.kind,
      category: form.category.trim(),
      unit: form.unit.trim() || 'ud',
      unitPriceCents: priceCents,
    }
    updateTenantData((data) => {
      if (editingId) {
        return {
          ...data,
          catalog: data.catalog.map((i) => (i.id === editingId ? { ...i, ...values } : i)),
        }
      }
      const item: CatalogItem = { id: newId(), tenantId: tenant.id, ...values }
      return { ...data, catalog: [item, ...data.catalog] }
    })
    reset()
  }

  function edit(item: CatalogItem) {
    setDialogOpen(true)
    setEditingId(item.id)
    setForm({
      sku: item.sku,
      name: item.name,
      kind: item.kind,
      category: item.category,
      unit: item.unit,
      price: centsToInput(item.unitPriceCents),
    })
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Catálogo</PageHeaderTitle>
          <PageHeaderDescription>
            Materiales, mano de obra y servicios con su precio.
          </PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Button variant="outline" onPress={() => setImportOpen(true)}>
            Importar de Excel
          </Button>
          <Button onPress={create}>Nuevo artículo</Button>
        </PageHeaderActions>
      </PageHeader>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        schema={catalogImportSchema}
        existingKeys={catalogKeys(catalog)}
        onImport={(values) =>
          updateTenantData((data) => ({
            ...data,
            catalog: [
              ...values.map((v) => ({ id: newId(), tenantId: data.tenant.id, ...v })),
              ...data.catalog,
            ],
          }))
        }
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : reset())}
        title={editingId ? 'Editar artículo' : 'Nuevo artículo'}
        description="Podrás usarlo al crear presupuestos."
        submitLabel={editingId ? 'Guardar cambios' : 'Añadir al catálogo'}
        submitDisabled={
          !form.name.trim() ||
          form.name.trim().length > formLimits.catalogName ||
          parseEuros(form.price) < 0 ||
          parseEuros(form.price) > formLimits.monetaryAmount * 100
        }
        onSubmit={save}
      >
        <TextField
          label="Nombre"
          minLength={1}
          maxLength={formLimits.catalogName}
          helper={`Obligatorio · máximo ${formLimits.catalogName} caracteres.`}
          className="sm:col-span-2"
          placeholder="Ej. Alicatado de pared"
          icon={fieldIcons.tag}
          value={form.name}
          onChange={(v) => set('name', v)}
        />
        <TextField
          label="Referencia"
          maxLength={formLimits.sku}
          placeholder="MAT-001"
          icon={fieldIcons.hash}
          helper="Tu código interno."
          value={form.sku}
          onChange={(v) => set('sku', v)}
        />
        <SelectField
          label="Tipo"
          value={form.kind}
          options={kindOptions}
          onChange={(v) => set('kind', v as CatalogKind)}
        />
        <TextField
          label="Categoría"
          maxLength={formLimits.category}
          placeholder="Ej. Albañilería"
          helper="Sirve para filtrar el catálogo."
          value={form.category}
          onChange={(v) => set('category', v)}
        />
        <TextField
          label="Unidad"
          maxLength={formLimits.unit}
          placeholder="m², h, ud…"
          icon={fieldIcons.ruler}
          value={form.unit}
          onChange={(v) => set('unit', v)}
        />
        <TextField
          label="Precio unitario (€, sin IVA)"
          maxLength={18}
          className="sm:col-span-2"
          placeholder="0,00"
          icon={fieldIcons.euro}
          helper="El IVA se añade al crear el presupuesto."
          value={form.price}
          onChange={(v) => set('price', v)}
        />
      </FormDialog>

      <FilterBar>
        <Input
          aria-label="Buscar en el catálogo"
          maxLength={formLimits.searchQuery}
          placeholder="Buscar por referencia, nombre, categoría o unidad"
          className="sm:max-w-sm sm:flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label="Filtrar por tipo"
          hideLabel
          className="sm:w-44"
          value={kindFilter}
          options={[{ value: 'all', label: 'Todos los tipos' }, ...kindOptions]}
          onChange={(v) => setKindFilter(v as 'all' | CatalogKind)}
        />
        <SelectField
          label="Filtrar por categoría"
          hideLabel
          className="sm:w-48"
          value={categoryFilter}
          options={[
            { value: 'all', label: 'Todas las categorías' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCategoryFilter}
        />
        {query || kindFilter !== 'all' || categoryFilter !== 'all' ? (
          <Button
            variant="ghost"
            onPress={() => {
              setQuery('')
              setKindFilter('all')
              setCategoryFilter('all')
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </FilterBar>

      {visible.length === 0 ? (
        catalog.length === 0 ? (
          <EmptyPanel
            icon={fieldIcons.tag}
            title="Tu catálogo está vacío"
            description="Guarda aquí tus materiales y tu mano de obra con su precio. Así los añades a un presupuesto en un clic."
          >
            <Button onPress={create}>+ Añadir el primer artículo</Button>
          </EmptyPanel>
        ) : (
          <EmptyPanel
            icon={fieldIcons.search}
            title="Sin resultados"
            description="Ningún artículo coincide con lo que has buscado."
          >
            <Button
              variant="outline"
              onPress={() => {
                setQuery('')
                setKindFilter('all')
                setCategoryFilter('all')
              }}
            >
              Limpiar filtros
            </Button>
          </EmptyPanel>
        )
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {pager.pageItems.map((item) => (
              <li
                key={item.id}
                className="border-border bg-card space-y-3 rounded-lg border p-4 shadow-(--ui-shadow-hairline)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {[item.sku, item.category].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold tabular-nums">
                    {formatEuros(item.unitPriceCents)}
                    <span className="text-muted-foreground block text-xs font-normal">
                      / {item.unit}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{kindLabels[item.kind]}</Badge>
                  <span className="flex-1" />
                  <Button variant="outline" onPress={() => edit(item)}>
                    Editar
                  </Button>
                  <Button
                    className="text-destructive"
                    variant="ghost"
                    onPress={() => setToDelete(item)}
                  >
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Table containerClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Ref.</TableHead>
                <TableHead>Artículo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                  <TableCell className="font-medium">
                    {item.name}
                    <div className="text-muted-foreground text-xs">{item.category}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{kindLabels[item.kind]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuros(item.unitPriceCents)} / {item.unit}
                  </TableCell>
                  <TableRowActions onEdit={() => edit(item)} onDelete={() => setToDelete(item)} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <TablePagination controller={pager} noun="artículos" />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="¿Eliminar artículo?"
        description={
          toDelete
            ? `«${toDelete.name}» se quitará del catálogo. Los presupuestos ya creados no cambian.`
            : null
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          const id = toDelete.id
          updateTenantData((d) => ({ ...d, catalog: d.catalog.filter((i) => i.id !== id) }))
          setToDelete(null)
        }}
      />
    </div>
  )
}
