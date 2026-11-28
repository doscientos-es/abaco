import { Button } from '@doscientos/ui'
import { useEffect, useRef, useState } from 'react'

import { currentTenantData, getSaveStatus, refreshStore } from '@/shared/store/store'
import { FormDialog } from '@/shared/ui/form-dialog'

import type { ClientType } from '../application/client-types'
import {
  loadExistingDirectory,
  readDirectoryWorkbook,
  writeDirectoryWorkbookRow,
  type DirectorySheet,
} from '../application/directory-workbook-actions'
import {
  executeDirectoryImport,
  previewDirectory,
  suggestDirectoryMapping,
  validWorkbookNamespace,
  workbookKey,
  type DirectoryPreview,
  type ImportOutcome,
  type Mapping,
  type ParentChoice,
} from '../domain/directory-workbook'
import { DirectorySheetMapping, directoryFieldClass } from './directory-workbook-mapping'
import { DirectoryImportRows, previewRowText, resultText } from './directory-workbook-review'

type ClientOption = { id: string; name: string; archivedAt?: string | null }
type SheetChoice = { index: number | null; fields: Mapping }
const empty: SheetChoice = { index: null, fields: {} }

export function DirectoryWorkbookDialog({
  open,
  onClose,
  tenantId,
  clients,
  types,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  clients: readonly ClientOption[]
  types: readonly ClientType[]
}) {
  const [sheets, setSheets] = useState<DirectorySheet[]>([])
  const [customers, setCustomers] = useState<SheetChoice>(empty)
  const [locations, setLocations] = useState<SheetChoice>(empty)
  const [namespace, setNamespace] = useState('')
  const [clientKind, setClientKind] = useState('')
  const [parent, setParent] = useState('')
  const [preview, setPreview] = useState<DirectoryPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<ImportOutcome[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const stage = result ? 'result' : preview ? 'preview' : 'mapping'
  useEffect(() => {
    if (stage !== 'mapping') heading.current?.focus()
  }, [stage])

  const ready = preview?.rows.flatMap((row) => ('draft' in row ? [row.draft] : [])) ?? []
  const client = clients.find((item) => item.id === parent && !item.archivedAt)
  const activeClients = clients.filter((item) => !item.archivedAt)
  const readyCustomers = ready.filter(({ target }) => target === 'client').length
  const readyLocations = ready.length - readyCustomers

  async function run(task: () => Promise<void>) {
    if (operation.current) return
    operation.current = true
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.')
    } finally {
      operation.current = false
      setBusy(false)
    }
  }

  function close() {
    if (operation.current) return
    setSheets([])
    setCustomers(empty)
    setLocations(empty)
    setNamespace('')
    setClientKind('')
    setParent('')
    setPreview(null)
    setConfirmed(false)
    setResult(null)
    setError('')
    onClose()
  }

  function load(file: File | undefined) {
    if (!file) return
    void run(async () => {
      setSheets([])
      setCustomers(empty)
      setLocations(empty)
      setPreview(null)
      setConfirmed(false)
      setParent('')
      setSheets(await readDirectoryWorkbook(file))
    })
  }

  function openPreview() {
    void run(async () => {
      const ns = workbookKey(namespace)
      if (!validWorkbookNamespace(ns))
        throw new Error(
          'Indica un origen estable de hasta 40 caracteres (letras ASCII, números, puntos, guiones o guiones bajos).',
        )
      if (customers.index === null && locations.index === null)
        throw new Error('Elige al menos una hoja.')
      if (customers.index !== null && customers.index === locations.index)
        throw new Error('Elige hojas distintas para clientes y centros.')
      if (
        locations.index !== null &&
        ((parent === 'by-code' && customers.index === null) || (parent !== 'by-code' && !client))
      )
        throw new Error(
          'Elige un cliente existente o usa los IDs de los clientes nuevos de este mismo lote.',
        )
      const nsClient = customers.index === null ? null : sheets[customers.index]
      const nsLocation = locations.index === null ? null : sheets[locations.index]
      const existingParent: Extract<ParentChoice, { kind: 'existing' }> | undefined = client
        ? { kind: 'existing', clientId: client.id, name: client.name }
        : undefined
      const existing = await loadExistingDirectory(tenantId, ns, existingParent?.clientId)
      setConfirmed(false)
      setPreview(
        previewDirectory({
          ...(nsClient ? { clientSheet: { rows: nsClient.rows, fields: customers.fields } } : {}),
          ...(nsLocation
            ? { locationSheet: { rows: nsLocation.rows, fields: locations.fields } }
            : {}),
          ...(existingParent ? { existingParent } : {}),
          clientKind,
          existing,
        }),
      )
    })
  }

  function importRows() {
    if (!preview || preview.errors.length || !ready.length || !confirmed) return
    void run(async () => {
      if (getSaveStatus().state !== 'saved')
        throw new Error('Espera a que se guarden los cambios pendientes antes de importar.')
      const ns = workbookKey(namespace)
      const outcomes = await executeDirectoryImport(ready, (row, parentId) => {
        if (currentTenantData()?.tenant.id !== tenantId)
          throw new Error('La empresa activa ha cambiado.')
        return writeDirectoryWorkbookRow(tenantId, ns, row, parentId)
      })
      setResult(outcomes)
      setSheets([])
      setPreview(null)
      setConfirmed(false)
      await refreshStore()
    })
  }

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="Importar clientes y centros"
      description="Usa los IDs estables de tu archivo. La vista previa no guarda nada ni actualiza registros existentes."
      submitLabel={
        busy
          ? 'Procesando…'
          : result
            ? 'Cerrar'
            : preview
              ? 'Crear registros confirmados'
              : 'Revisar filas'
      }
      submitDisabled={
        result
          ? false
          : preview
            ? !ready.length || !confirmed || preview.errors.length > 0
            : !sheets.length || (customers.index === null && locations.index === null)
      }
      isSubmitting={busy}
      onSubmit={() => (result ? close() : preview ? importRows() : openPreview())}
    >
      <div className="grid min-w-0 gap-3 sm:col-span-2">
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        {!preview && !result ? (
          <>
            <label className="grid min-w-0 gap-1 text-sm">
              Archivo de clientes y centros
              <input
                type="file"
                accept=".xlsx,.csv,.txt"
                className={directoryFieldClass}
                onChange={(event) => {
                  load(event.currentTarget.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
            </label>
            <p className="text-muted-foreground text-sm">
              Un Excel puede tener una hoja para cada tabla. Un CSV solo puede importar una tabla
              por vez. Usa encabezados en la primera fila y guarda los IDs con ceros iniciales como
              texto. No incluyas datos que no necesites ni envíes el archivo a servicios externos.
            </p>
            {sheets.length ? (
              <>
                <label className="grid gap-1 text-sm">
                  Origen estable del archivo
                  <input
                    className={directoryFieldClass}
                    value={namespace}
                    placeholder="crm-antiguo"
                    maxLength={40}
                    onChange={(event) => setNamespace(event.currentTarget.value)}
                  />
                </label>
                <p className="text-muted-foreground text-sm">
                  Repite el mismo origen en las siguientes importaciones del mismo sistema para
                  reconocer sus IDs.
                </p>
                <DirectorySheetMapping
                  target="client"
                  sheets={sheets}
                  sheetIndex={customers.index}
                  mapping={customers.fields}
                  changeSheet={(index) =>
                    setCustomers({
                      index,
                      fields:
                        index === null
                          ? {}
                          : suggestDirectoryMapping(sheets[index]?.rows ?? [], 'client'),
                    })
                  }
                  changeMapping={(fields) => setCustomers((current) => ({ ...current, fields }))}
                />
                {customers.index !== null ? (
                  <label className="grid gap-1 text-sm">
                    Tipo para los clientes nuevos
                    <select
                      className={directoryFieldClass}
                      value={clientKind}
                      onChange={(event) => setClientKind(event.currentTarget.value)}
                    >
                      <option value="">Elige un tipo</option>
                      {types.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <DirectorySheetMapping
                  target="location"
                  sheets={sheets}
                  sheetIndex={locations.index}
                  mapping={locations.fields}
                  parentByCode={parent === 'by-code'}
                  changeSheet={(index) =>
                    setLocations({
                      index,
                      fields:
                        index === null
                          ? {}
                          : suggestDirectoryMapping(sheets[index]?.rows ?? [], 'location'),
                    })
                  }
                  changeMapping={(fields) => setLocations((current) => ({ ...current, fields }))}
                />
                {locations.index !== null ? (
                  <label className="grid gap-1 text-sm">
                    Cliente de destino para los centros
                    <select
                      className={directoryFieldClass}
                      value={parent}
                      onChange={(event) => setParent(event.currentTarget.value)}
                    >
                      <option value="">Elige el cliente explícitamente</option>
                      {customers.index !== null ? (
                        <option value="by-code">IDs de los clientes nuevos de este archivo</option>
                      ) : null}
                      {activeClients.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name} · {id.slice(-8)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        {preview ? (
          <>
            <h2 ref={heading} tabIndex={-1} className="font-semibold">
              Vista previa de la importación
            </h2>
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="min-h-11 w-fit"
              onPress={() => {
                setPreview(null)
                setConfirmed(false)
              }}
            >
              Cambiar asignación
            </Button>
            {preview.errors.map((text) => (
              <p key={text} role="alert" className="text-destructive text-sm">
                {text}
              </p>
            ))}
            <p className="text-sm">
              Clientes listos: {readyCustomers}. Centros listos: {readyLocations}. Filas que se
              omiten: {preview.rows.length - ready.length}.
            </p>
            <DirectoryImportRows rows={preview.rows}>{previewRowText}</DirectoryImportRows>
            {ready.length && !preview.errors.length ? (
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-primary size-5 shrink-0"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.currentTarget.checked)}
                />
                He revisado las {ready.length} filas listas. Quiero crear solo estos registros.
              </label>
            ) : null}
          </>
        ) : null}
        {result ? (
          <>
            <h2 ref={heading} tabIndex={-1} className="font-semibold">
              Resultado de la importación
            </h2>
            <p className="text-sm">
              Creadas y confirmadas: {result.filter(({ status }) => status === 'created').length} de{' '}
              {result.length}. Si una fila no se confirmó, comprueba el directorio antes de
              reintentar.
            </p>
            <DirectoryImportRows rows={result}>
              {(row) => resultText[row.status]}
            </DirectoryImportRows>
          </>
        ) : null}
      </div>
    </FormDialog>
  )
}
