import { receiptUpload, uploadExtension } from '@/shared/domain/upload-file'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { AiDocument, AiRequest } from '../domain/requests'
import {
  estimateSuggestionSchema,
  receiptSuggestionSchema,
  type EstimateSuggestion,
  type ReceiptSuggestion,
} from '../domain/suggestions'

const aiUpload = { ...receiptUpload, maxMiB: 2 }

/** Files remain in memory and are sent only when the user requests analysis. */
export async function aiDocument(file: File): Promise<AiDocument> {
  uploadExtension(file, aiUpload)
  if (file.size > 2_000_000) throw new Error('El archivo supera los 2 MB permitidos para IA.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return { mimeType: file.type as AiDocument['mimeType'], data: btoa(binary) }
}

export function requestSuggestion(
  tenantId: string,
  request: Extract<AiRequest, { task: 'receipt' }>,
): Promise<ReceiptSuggestion>
export function requestSuggestion(
  tenantId: string,
  request: Extract<AiRequest, { task: 'estimate' }>,
): Promise<EstimateSuggestion>
export async function requestSuggestion(tenantId: string, request: AiRequest) {
  const { data, error } = await createBrowserSupabaseClient().auth.getSession()
  if (error || !data.session) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
  const response = await fetch('/api/ai_suggestion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ tenantId, request }),
  })
  if (!response.ok) {
    if (response.status === 403)
      throw new Error('La IA no está activa para tu usuario o no tienes permiso.')
    if (response.status === 429)
      throw new Error('Has alcanzado el límite de uso de IA de este periodo.')
    if (response.status === 413)
      throw new Error('El documento o la conversación son demasiado largos.')
    if (response.status === 503) {
      const body: unknown = await response.json().catch(() => null)
      if (body && typeof body === 'object' && 'error' in body && body.error === 'provider_limit')
        throw new Error('El proveedor de IA ha alcanzado un límite. Contacta con soporte.')
    }
    throw new Error('No se pudo generar la propuesta. Inténtalo de nuevo.')
  }
  const body: unknown = await response.json()
  const suggestion =
    body && typeof body === 'object' && 'suggestion' in body ? body.suggestion : null
  const parsed = (
    request.task === 'receipt' ? receiptSuggestionSchema : estimateSuggestionSchema
  ).safeParse(suggestion)
  if (!parsed.success) throw new Error('No se pudo interpretar la respuesta. Inténtalo de nuevo.')
  return parsed.data
}
