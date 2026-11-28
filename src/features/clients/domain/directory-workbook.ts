import { normalizeHeader } from '@/shared/domain/table-import'

export type DirectoryTarget = 'client' | 'location'
type Field = 'key' | 'name' | 'taxId' | 'email' | 'address' | 'city' | 'postalCode' | 'parentKey'
export type Mapping = Partial<Record<Field, number>>
export type DirectoryField = { id: Field; label: string; required?: boolean; aliases?: string[] }

const code = (label: string): DirectoryField => ({
  id: 'key',
  label,
  required: true,
  aliases: ['ID', 'Código', 'Referencia'],
})
export const directoryFields: Record<DirectoryTarget, DirectoryField[]> = {
  client: [
    code('ID cliente'),
    { id: 'name', label: 'Nombre', required: true, aliases: ['Cliente', 'Razón social'] },
    { id: 'taxId', label: 'NIF', aliases: ['CIF', 'Documento fiscal'] },
    { id: 'email', label: 'Email', aliases: ['Correo'] },
  ],
  location: [
    code('ID centro'),
    { id: 'name', label: 'Nombre', required: true, aliases: ['Centro'] },
    { id: 'address', label: 'Dirección', required: true, aliases: ['Domicilio'] },
    { id: 'city', label: 'Municipio', aliases: ['Localidad', 'Ciudad'] },
    { id: 'postalCode', label: 'Código postal', aliases: ['CP'] },
    { id: 'parentKey', label: 'ID cliente', aliases: ['Código cliente', 'Referencia cliente'] },
  ],
}
export const MAX_DIRECTORY_ROWS = 100
const idPattern = /^[a-z0-9][a-z0-9._/-]{0,79}$/
export const workbookKey = (value: string) => value.trim().toLowerCase()
export const validWorkbookNamespace = (value: string) =>
  /^[a-z0-9][a-z0-9._-]{0,39}$/.test(workbookKey(value))

export function directoryHeaders(sheet: string[][]) {
  const header = sheet.findIndex((row) => row.some((cell) => cell.trim()))
  const columns = (sheet[header] ?? [])
    .slice(0, 200)
    .flatMap((label, index) => (label.trim() ? [{ index, label: label.trim() }] : []))
  return { header, columns }
}

export function suggestDirectoryMapping(sheet: string[][], target: DirectoryTarget): Mapping {
  const { columns } = directoryHeaders(sheet)
  const mapping: Mapping = {}
  for (const field of directoryFields[target]) {
    const names = [field.label, ...(field.aliases ?? [])].map(normalizeHeader)
    const matched = columns.filter(({ label }) => names.includes(normalizeHeader(label)))
    if (matched.length === 1 && matched[0]) mapping[field.id] = matched[0].index
  }
  return mapping
}

export type ExistingDirectory = {
  clients: { id: string; name: string; tax_id: string; email: string; archived_at: string | null }[]
  locations: { client_id: string; name: string; address: string }[]
  clientKeys: string[]
  locationKeys: string[]
}
export type ClientFields = { name: string; taxId: string; email: string; kind: string }
export type LocationFields = { name: string; address: string; city: string; postalCode: string }
export type ParentChoice =
  | { kind: 'existing'; clientId: string; name: string }
  | { kind: 'new'; sourceKey: string }
export type DirectoryDraft =
  | { target: 'client'; key: string; line: number; values: ClientFields }
  | { target: 'location'; key: string; line: number; values: LocationFields; parent: ParentChoice }
export type DirectoryPreviewRow =
  | { target: DirectoryTarget; line: number; draft: DirectoryDraft }
  | { target: DirectoryTarget; line: number; message: string }

type SheetMapping = { rows: string[][]; fields: Mapping }
export type DirectoryPreview = { rows: DirectoryPreviewRow[]; errors: string[] }

const normalize = (value: string) => value.trim().toLowerCase()
const tax = (value: string) => value.toUpperCase().replace(/[\s-]/g, '')
function clientHints(client: { name: string; taxId: string; email: string }) {
  return [
    `name:${normalize(client.name)}`,
    ...(tax(client.taxId) ? [`tax:${tax(client.taxId)}`] : []),
    ...(client.email ? [`email:${normalize(client.email)}`] : []),
  ]
}
const locationHints = (location: { name: string; address: string }) => [
  `name:${normalize(location.name)}`,
  `address:${normalize(location.address)}`,
]
function keyCounts<T>(rows: T[], keys: (row: T) => string[]) {
  const result = new Map<string, number>()
  for (const row of rows) for (const key of keys(row)) result.set(key, (result.get(key) ?? 0) + 1)
  return result
}
function mappedRows(sheet: SheetMapping, target: DirectoryTarget, requireParent: boolean) {
  const { header, columns } = directoryHeaders(sheet.rows)
  if (header < 0) throw new Error('La hoja está vacía.')
  const useFields = directoryFields[target].filter(
    (field) => field.id !== 'parentKey' || requireParent,
  )
  const indexes = useFields.flatMap(({ id, label, required }) => {
    const index = sheet.fields[id]
    if (index === undefined) {
      if (required || id === 'parentKey') throw new Error(`Asigna la columna «${label}».`)
      return []
    }
    if (!columns.some((column) => column.index === index))
      throw new Error(`Columna inválida: ${label}.`)
    return [index]
  })
  if (new Set(indexes).size !== indexes.length)
    throw new Error('Usa una columna distinta para cada campo.')
  const rows = sheet.rows.slice(header + 1).flatMap((cells, i) =>
    cells.some((cell) => cell.trim())
      ? [
          {
            line: header + i + 2,
            value: (id: Field) => {
              const position = sheet.fields[id]
              return position === undefined ? '' : (cells[position]?.trim() ?? '')
            },
          },
        ]
      : [],
  )
  if (!rows.length) throw new Error('No hay filas después de las cabeceras.')
  if (rows.length > MAX_DIRECTORY_ROWS)
    throw new Error(`Selecciona hasta ${MAX_DIRECTORY_ROWS} filas por hoja.`)
  return rows
}

export function previewDirectory(input: {
  clientSheet?: SheetMapping
  locationSheet?: SheetMapping
  clientKind: string
  existingParent?: Extract<ParentChoice, { kind: 'existing' }>
  existing: ExistingDirectory
}): DirectoryPreview {
  const rows: DirectoryPreviewRow[] = []
  const errors: string[] = []
  const acceptedClients = new Set<string>()
  if (input.clientSheet) {
    try {
      if (!input.clientKind) throw new Error('Elige el tipo de cliente.')
      const candidates = mappedRows(input.clientSheet, 'client', false).map(({ line, value }) => ({
        line,
        key: workbookKey(value('key')),
        values: {
          name: value('name'),
          taxId: value('taxId'),
          email: value('email'),
          kind: input.clientKind,
        },
      }))
      const keys = keyCounts(candidates, (row) => [row.key])
      const hints = keyCounts(candidates, (row) => clientHints(row.values))
      const existingHints = new Set(
        input.existing.clients.flatMap((row) =>
          clientHints({ name: row.name, taxId: row.tax_id, email: row.email }),
        ),
      )
      for (const row of candidates) {
        const { line, key, values } = row
        const error = !idPattern.test(key)
          ? 'ID cliente no válido.'
          : (keys.get(key) ?? 0) > 1
            ? 'ID cliente repetido en la hoja.'
            : input.existing.clientKeys.includes(key)
              ? 'ID cliente ya importado. No se modifica.'
              : !values.name || values.name.length > 160
                ? 'Indica un nombre de hasta 160 caracteres.'
                : values.taxId.length > 32
                  ? 'Identificación fiscal demasiado larga.'
                  : values.email &&
                      (values.email.length > 254 ||
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
                    ? 'Correo no válido.'
                    : clientHints(values).some(
                          (hint) => existingHints.has(hint) || (hints.get(hint) ?? 0) > 1,
                        )
                      ? 'Posible cliente duplicado (también se comprueban archivados). Revísalo fuera del lote.'
                      : null
        if (error) rows.push({ target: 'client', line, message: error })
        else {
          rows.push({ target: 'client', line, draft: { target: 'client', ...row } })
          acceptedClients.add(key)
        }
      }
    } catch (error) {
      errors.push(
        `Clientes: ${error instanceof Error ? error.message : 'No se pudo leer la hoja.'}`,
      )
    }
  }
  if (input.locationSheet) {
    try {
      const existingParent = input.existingParent
      if (
        existingParent &&
        !input.existing.clients.some(
          ({ id, archived_at }) => id === existingParent.clientId && archived_at === null,
        )
      )
        throw new Error('Selecciona un cliente activo de esta empresa.')
      const candidates = mappedRows(input.locationSheet, 'location', !existingParent).map(
        ({ line, value }) => {
          const parent: ParentChoice = existingParent ?? {
            kind: 'new',
            sourceKey: workbookKey(value('parentKey')),
          }
          return {
            line,
            key: workbookKey(value('key')),
            parent,
            values: {
              name: value('name'),
              address: value('address'),
              city: value('city'),
              postalCode: value('postalCode'),
            },
          }
        },
      )
      const scope = (row: (typeof candidates)[number]) =>
        row.parent.kind === 'existing' ? row.parent.clientId : row.parent.sourceKey
      const keys = keyCounts(candidates, (row) => [`${scope(row)}:${row.key}`])
      const hints = keyCounts(candidates, (row) =>
        locationHints(row.values).map((hint) => `${scope(row)}:${hint}`),
      )
      const currentHints = new Set(input.existing.locations.flatMap((row) => locationHints(row)))
      for (const row of candidates) {
        const { line, key, values, parent } = row
        const error = !idPattern.test(key)
          ? 'ID centro no válido.'
          : (keys.get(`${scope(row)}:${key}`) ?? 0) > 1
            ? 'ID centro repetido para el mismo cliente.'
            : parent.kind === 'new' && !acceptedClients.has(parent.sourceKey)
              ? 'El ID cliente no corresponde a una fila nueva lista. Elige un cliente existente si procede.'
              : parent.kind === 'existing' && input.existing.locationKeys.includes(key)
                ? 'ID centro ya importado para este cliente. No se modifica.'
                : !values.name ||
                    values.name.length > 160 ||
                    !values.address ||
                    values.address.length > 500 ||
                    values.city.length > 160 ||
                    values.postalCode.length > 32
                  ? 'Revisa el nombre, la dirección, el municipio y el código postal.'
                  : locationHints(values).some(
                        (hint) =>
                          (parent.kind === 'existing' && currentHints.has(hint)) ||
                          (hints.get(`${scope(row)}:${hint}`) ?? 0) > 1,
                      )
                    ? 'Posible centro duplicado. Revísalo fuera del lote.'
                    : null
        if (error) rows.push({ target: 'location', line, message: error })
        else rows.push({ target: 'location', line, draft: { target: 'location', ...row } })
      }
    } catch (error) {
      errors.push(`Centros: ${error instanceof Error ? error.message : 'No se pudo leer la hoja.'}`)
    }
  }
  return { rows, errors }
}

export type ImportRowReply =
  | { status: 'created'; id: string }
  | { status: 'repeated' | 'collision' | 'invalid_parent' }
export type ImportOutcome = {
  line: number
  target: DirectoryTarget
  status: ImportRowReply['status'] | 'dependency' | 'unknown' | 'not-attempted'
}

export async function executeDirectoryImport(
  rows: DirectoryDraft[],
  write: (row: DirectoryDraft, parentId?: string) => Promise<ImportRowReply>,
): Promise<ImportOutcome[]> {
  const saved = new Map<string, string>()
  const output: ImportOutcome[] = []
  let stopped = false
  // Snapshot approved rows; never resolve a new-parent centre from a pre-existing ID.
  for (const row of [
    ...rows.filter(({ target }) => target === 'client'),
    ...rows.filter(({ target }) => target === 'location'),
  ]) {
    const { line, target } = row
    if (stopped) {
      output.push({ line, target, status: 'not-attempted' })
      continue
    }
    const parentId =
      row.target === 'location'
        ? row.parent.kind === 'existing'
          ? row.parent.clientId
          : saved.get(row.parent.sourceKey)
        : undefined
    if (row.target === 'location' && !parentId) {
      output.push({ line, target, status: 'dependency' })
      continue
    }
    try {
      const result = await write(row, parentId)
      if (result.status === 'created' && row.target === 'client') saved.set(row.key, result.id)
      output.push({ line, target, status: result.status })
    } catch {
      output.push({ line, target, status: 'unknown' })
      stopped = true
    }
  }
  return output
}
