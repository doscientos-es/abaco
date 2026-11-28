import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type {
  DirectoryDraft,
  ExistingDirectory,
  ImportRowReply,
} from '../domain/directory-workbook'

export async function loadExistingDirectory(
  tenantId: string,
  namespace: string,
  parentId?: string,
): Promise<ExistingDirectory> {
  const db = createBrowserSupabaseClient()
  const error = 'No se pudo comprobar el directorio actual. No se ha importado nada.'
  const [clients, locations, clientsAlreadyImported, locationsAlreadyImported] = await Promise.all([
    fetchAllPages<ExistingDirectory['clients'][number]>(
      (from, to) =>
        db
          .from('clients')
          .select('id,name,tax_id,email,archived_at')
          .eq('tenant_id', tenantId)
          .order('id')
          .range(from, to),
      error,
    ),
    parentId
      ? fetchAllPages<ExistingDirectory['locations'][number]>(
          (from, to) =>
            db
              .from('service_locations')
              .select('client_id,name,address')
              .eq('tenant_id', tenantId)
              .eq('client_id', parentId)
              .order('id')
              .range(from, to),
          error,
        )
      : [],
    fetchAllPages<{ source_key: string }>(
      (from, to) =>
        db
          .from('directory_workbook_client_keys')
          .select('source_key')
          .eq('tenant_id', tenantId)
          .eq('source_namespace', namespace)
          .order('source_key')
          .range(from, to),
      error,
    ),
    parentId
      ? fetchAllPages<{ source_key: string }>(
          (from, to) =>
            db
              .from('directory_workbook_location_keys')
              .select('source_key')
              .eq('tenant_id', tenantId)
              .eq('source_namespace', namespace)
              .eq('client_id', parentId)
              .order('source_key')
              .range(from, to),
          error,
        )
      : [],
  ])
  return {
    clients,
    locations,
    clientKeys: clientsAlreadyImported.map(({ source_key }) => source_key),
    locationKeys: locationsAlreadyImported.map(({ source_key }) => source_key),
  }
}

export async function writeDirectoryWorkbookRow(
  tenantId: string,
  namespace: string,
  row: DirectoryDraft,
  parentId?: string,
): Promise<ImportRowReply> {
  const { data, error } = await createBrowserSupabaseClient().rpc('import_directory_workbook_row', {
    p_tenant_id: tenantId,
    p_namespace: namespace,
    p_source_key: row.key,
    p_target: row.target,
    p_parent_client_id: parentId ?? null,
    p_values: row.values,
  })
  if (error) throw new Error('No se confirmó la escritura de la fila.')
  if (data?.status === 'created' && typeof data.id === 'string' && data.id)
    return { status: 'created', id: data.id }
  if (
    data?.status === 'repeated' ||
    data?.status === 'collision' ||
    data?.status === 'invalid_parent'
  )
    return { status: data.status }
  throw new Error('No se confirmó la escritura de la fila.')
}
