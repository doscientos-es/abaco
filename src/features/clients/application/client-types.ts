import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ClientType = { id: string; value: string; label: string; position: number }

export const clientTypesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['client-types', tenantId],
    queryFn: async (): Promise<ClientType[]> => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('client_types')
        .select('id, value, label, position')
        .eq('tenant_id', tenantId)
        .order('position')
        .order('id')
      if (error) throw new Error('No se pudieron cargar los tipos de cliente.')
      return data as ClientType[]
    },
  })

export async function addClientType(tenantId: string, label: string, position: number) {
  const { error } = await createBrowserSupabaseClient().from('client_types').insert({
    tenant_id: tenantId,
    value: crypto.randomUUID(),
    label: label.trim(),
    position,
  })
  if (error) throw clientTypeError(error.code)
}

export async function renameClientType(tenantId: string, id: string, label: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('client_types')
    .update({ label: label.trim() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw clientTypeError(error.code)
  if (!data) throw new Error('El tipo ya no existe o no tienes permiso para modificarlo.')
}

export async function deleteClientType(tenantId: string, id: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('client_types')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw clientTypeError(error.code)
  if (!data) throw new Error('El tipo ya no existe o no tienes permiso para eliminarlo.')
}

export async function moveClientType(tenantId: string, id: string, direction: -1 | 1) {
  const { error } = await createBrowserSupabaseClient().rpc('move_client_type', {
    target_tenant: tenantId,
    target_id: id,
    direction,
  })
  if (error) throw clientTypeError(error.code)
}

function clientTypeError(code: string): Error {
  if (code === '23503')
    return new Error(
      'No se puede eliminar: hay clientes que utilizan este tipo, incluidos los archivados.',
    )
  if (code === '23505') return new Error('Ya existe un tipo de cliente con ese nombre.')
  return new Error('No se pudo guardar el tipo de cliente. Inténtalo de nuevo.')
}
