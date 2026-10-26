import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

const bucket = 'visit-photos'
const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type VisitPhotoPhase = 'before' | 'after' | 'other'
export type VisitPhoto = {
  id: string
  phase: VisitPhotoPhase
  caption: string
  storage_path: string
  created_at: string
  url: string
}

export function photoExtension(file: File) {
  const extension = mimeExtensions[file.type]
  if (!extension || file.size === 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('Elige una imagen JPEG, PNG o WebP de hasta 10 MB.')
  }
  return extension
}

export async function listVisitPhotos(tenantId: string, visitId: string): Promise<VisitPhoto[]> {
  const db = createBrowserSupabaseClient()
  const { data, error } = await db
    .from('service_visit_photos')
    .select('id,phase,caption,storage_path,created_at')
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return Promise.all(
    (data ?? []).map(async (photo) => {
      const signed = await db.storage.from(bucket).createSignedUrl(photo.storage_path, 600)
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(signed.error?.message ?? 'No se pudo abrir la fotografía privada.')
      }
      return { ...photo, url: signed.data.signedUrl } as VisitPhoto
    }),
  )
}

export async function uploadVisitPhoto(input: {
  tenantId: string
  visitId: string
  photoId: string
  operationId: string
  phase: VisitPhotoPhase
  caption: string
  file: File
}) {
  const extension = photoExtension(input.file)
  const db = createBrowserSupabaseClient()
  const path = `${input.tenantId}/${input.visitId}/${input.photoId}.${extension}`
  const upload = await db.storage.from(bucket).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  })
  // A prior upload may have committed before its registration response was lost.
  if (upload.error && String(upload.error.statusCode) !== '409') {
    throw new Error(upload.error.message)
  }
  const { data, error } = await db.rpc('register_service_visit_photo', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_photo_id: input.photoId,
    p_phase: input.phase,
    p_caption: input.caption,
    p_extension: extension,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return data as string
}
