import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type PaperSnapshot = { client?: string; center?: string; address?: string; tasks?: string; instructions?: string; requiresAcceptance?: boolean; timeKnown?: boolean }
export type PaperVisit = {
  id: string; client_id: string; location_id: string | null; contract_id: string | null;
  title: string; status: string; work_team_id: string | null; route_order: number;
  scheduled_start_at: string; scheduled_end_at: string; updated_at: string;
  contract_occurrence_on: string | null; performed_on: string | null; completion_notes: string;
  paper_snapshot: PaperSnapshot;
}
export type VisitEvent = { id: string; occurred_at: string; actor_id: string | null; payload: Record<string,unknown> }
export type SignedDocument = { id: string; name: string; object_path: string; created_at: string }

export async function loadPaperSnapshots(tenantId: string, ids: string[]) {
  const snapshots: Record<string,PaperSnapshot> = {}
  for (let offset=0;offset<ids.length;offset+=100) {
    const {data,error} = await createBrowserSupabaseClient().from('service_visits').select('id,paper_snapshot')
      .eq('tenant_id',tenantId).in('id',ids.slice(offset,offset+100))
    if (error) throw new Error(error.message)
    for (const row of data ?? []) snapshots[row.id] = row.paper_snapshot as PaperSnapshot
  }
  return snapshots
}

export async function loadPaperVisit(tenantId: string, visitId: string) {
  const db = createBrowserSupabaseClient()
  const [visit,events,documents] = await Promise.all([
    db.from('service_visits').select('id,client_id,location_id,contract_id,title,status,work_team_id,route_order,scheduled_start_at,scheduled_end_at,updated_at,contract_occurrence_on,performed_on,completion_notes,paper_snapshot').eq('tenant_id',tenantId).eq('id',visitId).single(),
    db.from('service_visit_events').select('id,occurred_at,actor_id,payload').eq('tenant_id',tenantId).eq('visit_id',visitId).order('occurred_at',{ascending:false}),
    db.from('visit_signed_documents').select('id,name,object_path,created_at').eq('tenant_id',tenantId).eq('visit_id',visitId).order('created_at'),
  ])
  for (const result of [visit,events,documents]) if (result.error) throw new Error(result.error.message)
  return { visit:visit.data as PaperVisit, events:(events.data ?? []) as VisitEvent[], documents:(documents.data ?? []) as SignedDocument[] }
}

export async function updatePaperVisit(tenantId: string, visit: PaperVisit, change: Record<string,unknown>, operationId: string) {
  const {error} = await createBrowserSupabaseClient().rpc('update_paper_visit',{p_tenant_id:tenantId,p_visit_id:visit.id,p_expected_updated_at:visit.updated_at,p_change:change,p_operation_id:operationId})
  if (error) throw new Error(error.message)
}

export async function uploadSignedDocument(tenantId: string, visitId: string, file: File, id: string) {
  if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 15*1024*1024) throw new Error('Usa PDF, JPEG, PNG o WebP de hasta 15 MB.')
  const db = createBrowserSupabaseClient()
  const path = `${tenantId}/${visitId}/${id}`
  const upload = await db.storage.from('signed-work-sheets').upload(path,file,{upsert:false,contentType:file.type})
  // An existing immutable path is safe on retry; registration still runs.
  if (upload.error && upload.error.statusCode !== '409') throw new Error(upload.error.message)
  const {error} = await db.from('visit_signed_documents').upsert({id,tenant_id:tenantId,visit_id:visitId,object_path:path,name:file.name.slice(0,240)},{onConflict:'id',ignoreDuplicates:true})
  if (error) throw new Error(error.message)
}

export async function openSignedDocument(path: string) {
  const {data,error} = await createBrowserSupabaseClient().storage.from('signed-work-sheets').createSignedUrl(path,60)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el documento')
  return data.signedUrl
}