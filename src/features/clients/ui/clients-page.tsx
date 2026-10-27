import {
  Button,
  ConfirmDialog,
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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import type { Client } from '@/shared/domain/types'
import { newId, updateTenantData, useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { ImportDialog } from '@/shared/ui/import-dialog'
import { EmptyPanel } from '@/shared/ui/page-states'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { clientImportSchema, clientKeys } from '../application/client-import'
import { ClientFormDialog } from './client-form-dialog'

export function ClientsPage() {
  const { clients } = useTenantData()
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [toArchive, setToArchive] = useState<Client | null>(null)

  const visible = clients.filter(
    (client) =>
      Boolean(client.archivedAt) === showArchived &&
      fuzzySearch(query, client.name, client.email, client.phone, client.taxId, client.address),
  )
  const pager = usePagination(visible, query)

  function reset() {
    setDialogOpen(false)
    setEditing(null)
  }

  function create() {
    setEditing(null)
    setDialogOpen(true)
  }

  function edit(client: Client) {
    setEditing(client)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Clientes</PageHeaderTitle>
          <PageHeaderDescription>Datos de contacto para tus presupuestos.</PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Button variant="outline" onPress={() => setImportOpen(true)}>
            Importar de Excel
          </Button>
          <Button onPress={create}>Nuevo cliente</Button>
        </PageHeaderActions>
      </PageHeader>

      <ClientFormDialog open={dialogOpen} client={editing} onClose={reset} />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        schema={clientImportSchema}
        existingKeys={clientKeys(clients)}
        onImport={(values) =>
          updateTenantData((data) => ({
            ...data,
            clients: [
              ...values.map((v) => ({ id: newId(), tenantId: data.tenant.id, ...v })),
              ...data.clients,
            ],
          }))
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Buscar clientes"
          maxLength={formLimits.searchQuery}
          placeholder="Buscar por nombre, email, teléfono o NIF"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button variant="outline" onPress={() => setShowArchived((current) => !current)}>
          {showArchived ? 'Ver activos' : 'Ver archivados'}
        </Button>
      </div>

      {visible.length === 0 ? (
        clients.length === 0 && !showArchived ? (
          <EmptyPanel
            icon={fieldIcons.user}
            title="Aún no tienes clientes"
            description="Añade a tu primer cliente para poder hacerle un presupuesto y enviárselo por WhatsApp o email."
          >
            <Button onPress={create}>+ Crear mi primer cliente</Button>
          </EmptyPanel>
        ) : (
          <EmptyPanel
            icon={fieldIcons.search}
            title="Sin resultados"
            description={
              showArchived
                ? 'No hay clientes archivados que coincidan con tu búsqueda.'
                : 'Ningún cliente coincide con tu búsqueda.'
            }
          >
            <Button variant="outline" onPress={() => setQuery('')}>
              Limpiar búsqueda
            </Button>
          </EmptyPanel>
        )
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {pager.pageItems.map((client) => (
              <li
                key={client.id}
                className="border-border bg-card space-y-3 rounded-lg border p-4 shadow-(--ui-shadow-hairline)"
              >
                <div className="min-w-0">
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: client.id }}
                    className="text-primary font-medium break-words hover:underline"
                  >
                    {client.name}
                  </Link>
                  {client.phone ? (
                    <a
                      href={`tel:${client.phone}`}
                      className="text-primary block text-sm break-words"
                    >
                      {client.phone}
                    </a>
                  ) : null}
                  {client.email ? (
                    <p className="text-muted-foreground truncate text-xs">{client.email}</p>
                  ) : null}
                  {client.address ? (
                    <p className="text-muted-foreground mt-1 text-xs break-words">
                      {client.address}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {showArchived ? (
                    <Button
                      className="flex-1"
                      variant="outline"
                      onPress={() =>
                        updateTenantData((data) => ({
                          ...data,
                          clients: data.clients.map((item) =>
                            item.id === client.id ? { ...item, archivedAt: null } : item,
                          ),
                        }))
                      }
                    >
                      Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button className="flex-1" variant="outline" onPress={() => edit(client)}>
                        Editar
                      </Button>
                      <Button
                        className="flex-1"
                        variant="ghost"
                        onPress={() => setToArchive(client)}
                      >
                        Archivar
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Table containerClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium break-words">
                    <Link
                      to="/clientes/$clientId"
                      params={{ clientId: client.id }}
                      className="text-primary hover:underline"
                    >
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {client.phone}
                    <div className="text-muted-foreground text-xs break-all">{client.email}</div>
                  </TableCell>
                  <TableCell className="break-words">{client.address}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {showArchived ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          updateTenantData((data) => ({
                            ...data,
                            clients: data.clients.map((item) =>
                              item.id === client.id ? { ...item, archivedAt: null } : item,
                            ),
                          }))
                        }
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <Button size="sm" variant="outline" onPress={() => edit(client)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onPress={() => setToArchive(client)}>
                          Archivar
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <TablePagination controller={pager} noun="clientes" />

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => {
          if (!open) setToArchive(null)
        }}
        title="¿Archivar cliente?"
        description={
          toArchive
            ? `«${toArchive.name}» se ocultará de la lista activa. Sus instalaciones y documentos se conservarán.`
            : null
        }
        confirmLabel="Archivar"
        onConfirm={() => {
          if (!toArchive) return
          const id = toArchive.id
          const archivedAt = new Date().toISOString()
          updateTenantData((data) => ({
            ...data,
            clients: data.clients.map((item) => (item.id === id ? { ...item, archivedAt } : item)),
          }))
          setToArchive(null)
        }}
      />
    </div>
  )
}
