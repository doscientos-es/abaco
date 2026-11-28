import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitPhotoPair = {
  before_photo_id: string
  after_photo_id: string
  created_at: string
}

export async function listVisitPhotoPairs(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_photo_pairs')
    .select('before_photo_id,after_photo_id,created_at')
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .order('created_at')
  if (error) throw new Error('No se pudieron consultar las parejas de fotos.')
  return (data ?? []) as VisitPhotoPair[]
}

export async function setVisitPhotoPair(
  tenantId: string,
  visitId: string,
  beforePhotoId: string,
  afterPhotoId: string,
  paired: boolean,
) {
  const { error } = await createBrowserSupabaseClient().rpc('set_service_visit_photo_pair', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_before_photo_id: beforePhotoId,
    p_after_photo_id: afterPhotoId,
    p_paired: paired,
  })
  if (error) {
    if (error.code === 'P0409') {
      throw new Error('La visita ya no admite cambios o una de las fotos tiene pareja.')
    }
    throw new Error('No se pudo actualizar la pareja. Revisa las fotos o inténtalo de nuevo.')
  }
}
