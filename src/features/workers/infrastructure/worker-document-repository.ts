import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { validateWorkerDocumentFile } from '../domain/worker-document-file'

const bucket = 'worker-documents'

export type WorkerDocument = {
  id: string
  name: string
  object_path: string
  created_at: string
}

export async function listWorkerDocuments(tenantId: string, workerId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('worker_documents')
    .select('id,name,object_path,created_at')
    .eq('tenant_id', tenantId)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WorkerDocument[]
}

export async function uploadWorkerDocument(input: {
  tenantId: string
  workerId: string
  id: string
  file: File
}) {
  const { tenantId, workerId, id, file } = input
  const validationError = validateWorkerDocumentFile(file)
  if (validationError) throw new Error(validationError)
  const name = file.name.trim().slice(0, 240)
  const db = createBrowserSupabaseClient()
  const path = `${tenantId}/${workerId}/${id}`
  const upload = await db.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  // Reuse the same immutable object if registration or its response failed.
  if (upload.error && String(upload.error.statusCode) !== '409')
    throw new Error(upload.error.message)
  const { error } = await db.rpc('register_worker_document', {
    p_tenant_id: tenantId,
    p_worker_id: workerId,
    p_id: id,
    p_name: name,
  })
  if (error) throw new Error(error.message)
}

export async function downloadWorkerDocument(path: string) {
  const { data, error } = await createBrowserSupabaseClient().storage.from(bucket).download(path)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo descargar el documento.')
  return data
}
