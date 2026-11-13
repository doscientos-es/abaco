import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { signedContractBucket, validateSignedContractPdf } from '../domain/contract-signature'

export async function recordContractSignature(input: {
  tenantId: string
  contractId: string
  expectedUpdatedAt: string
  operationId: string
  file: File | null
}): Promise<void> {
  const db = createBrowserSupabaseClient()
  let path: string | null = null
  if (input.file) {
    await validateSignedContractPdf(input.file)
    path = `${input.tenantId}/${input.contractId}/${input.operationId}.pdf`
    const upload = await db.storage.from(signedContractBucket).upload(path, input.file, {
      upsert: false,
      contentType: 'application/pdf',
    })
    // Reuse the immutable object when retrying a successful upload with a failed registration.
    if (upload.error && upload.error.statusCode !== '409') throw new Error(upload.error.message)
  }
  const { error } = await db.rpc('record_contract_signature', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_operation_id: input.operationId,
    p_document_path: path,
    p_document_name: input.file?.name.slice(0, 240) ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function signedContractDocumentUrl(path: string): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient()
    .storage.from(signedContractBucket)
    .createSignedUrl(path, 60)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el PDF firmado.')
  return data.signedUrl
}
