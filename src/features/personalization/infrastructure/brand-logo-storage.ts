import { logoUpload, uploadExtension } from '@/shared/domain/upload-file'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export async function uploadBrandLogo(tenantId: string, file: File): Promise<string> {
  const extension = uploadExtension(file, logoUpload)
  const storage = createBrowserSupabaseClient().storage.from('brand-logos')
  const path = `${tenantId}/${crypto.randomUUID()}.${extension}`
  const { error } = await storage.upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error('No se pudo subir el logo. Vuelve a intentarlo.')
  return storage.getPublicUrl(path).data.publicUrl
}
