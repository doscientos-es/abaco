import { logoUpload, uploadExtension } from '@/shared/domain/upload-file'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

const bucket = 'worker-avatars'

export async function loadWorkerAvatar(tenantId: string, userId: string) {
  const client = createBrowserSupabaseClient()
  const { data, error } = await client
    .from('worker_avatars')
    .select('object_path')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la foto.')
  if (!data) return null
  const signed = await client.storage.from(bucket).createSignedUrl(data.object_path, 1800)
  if (signed.error) throw new Error('No se pudo cargar la foto.')
  return signed.data.signedUrl
}

export async function saveWorkerAvatar(tenantId: string, userId: string, file: File | null) {
  const client = createBrowserSupabaseClient()
  const storage = client.storage.from(bucket)
  let path: string | null = null
  if (file) {
    const extension = uploadExtension(file, logoUpload)
    path = `${tenantId}/${userId}/${crypto.randomUUID()}.${extension}`
    const uploaded = await storage.upload(path, file, { contentType: file.type, upsert: false })
    if (uploaded.error) throw new Error('No se pudo subir la foto. Inténtalo de nuevo.')
  }
  let previousPath: unknown
  try {
    const result = await client.rpc('set_worker_avatar', {
      p_tenant: tenantId,
      p_user: userId,
      p_path: path,
    })
    if (result.error) throw result.error
    previousPath = result.data
  } catch {
    // The delete policy protects the current reference if the RPC actually committed.
    if (path) await storage.remove([path]).catch(() => undefined)
    throw new Error('No se pudo guardar la foto. Comprueba tus permisos e inténtalo de nuevo.')
  }
  if (typeof previousPath === 'string' && previousPath !== path)
    await storage.remove([previousPath]).catch(() => undefined)
}
