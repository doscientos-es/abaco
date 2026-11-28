import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type IncidentQuotePhoto = {
  id: string
  phase: 'before' | 'after' | 'other'
  caption: string
}
export type IncidentQuoteContext = {
  client_id: string
  centre_id: string | null
  centre_name: string | null
  centre_address: string | null
  visit_id: string | null
  photos: IncidentQuotePhoto[]
}
export type IncidentQuoteReview = IncidentQuoteContext & {
  client_name: string
  incident_version: string
}

function quoteError(code: string) {
  if (code === '42501' || code === 'P0402')
    return new Error(
      'No tienes permiso para este borrador o la empresa está en modo de solo lectura.',
    )
  if (code === 'P0409' || code === '23505')
    return new Error(
      'El hallazgo cambió o ya tiene un presupuesto. Actualiza y vuelve a revisarlo.',
    )
  if (code === '22023')
    return new Error('Revisa el título, las partidas y las fotos seleccionadas.')
  return new Error('No se pudo confirmar la operación. Comprueba la conexión e inténtalo otra vez.')
}

export async function loadIncidentQuoteReview(tenantId: string, incidentId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('get_incident_quote_review', {
    p_tenant_id: tenantId,
    p_incident_id: incidentId,
  })
  if (error || !data) throw quoteError(error?.code ?? '')
  return data as IncidentQuoteReview
}

export async function createIncidentQuoteDraft(input: {
  tenantId: string
  incidentId: string
  review: IncidentQuoteReview
  title: string
  lines: string[]
  photoIds: string[]
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_incident_quote_draft', {
    p_tenant_id: input.tenantId,
    p_incident_id: input.incidentId,
    p_client_id: input.review.client_id,
    p_centre_id: input.review.centre_id,
    p_incident_version: input.review.incident_version,
    p_title: input.title,
    p_lines: input.lines,
    p_photo_ids: input.photoIds,
    p_operation_id: input.operationId,
  })
  if (error || !data) throw quoteError(error?.code ?? '')
  return data as string
}

export async function loadIncidentQuoteDraftContext(tenantId: string, estimateId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'get_incident_quote_draft_context',
    {
      p_tenant_id: tenantId,
      p_estimate_id: estimateId,
    },
  )
  if (error) throw quoteError(error.code)
  return data as IncidentQuoteContext | null
}

export async function openIncidentQuotePhoto(tenantId: string, visitId: string, photoId: string) {
  const client = createBrowserSupabaseClient()
  const { data, error } = await client
    .from('service_visit_photos')
    .select('storage_path')
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .eq('id', photoId)
    .maybeSingle()
  if (error || !data?.storage_path) throw new Error('Esta foto privada ya no está disponible.')
  const signed = await client.storage.from('visit-photos').createSignedUrl(data.storage_path, 120)
  if (signed.error || !signed.data?.signedUrl)
    throw new Error('No se pudo abrir esta foto privada.')
  return signed.data.signedUrl
}
