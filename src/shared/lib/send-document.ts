import { toast } from '@doscientos/ui'

import { createBrowserSupabaseClient } from './supabase/client'

export type DocumentKind = 'invoice' | 'estimate'

const messages: Record<string, string> = {
  no_client_email: 'El cliente no tiene email. Añádelo en Clientes y vuelve a enviar.',
  forbidden: 'No tienes permiso para enviar documentos.',
  not_found:
    'No encontramos el documento en el servidor. Espera unos segundos a que se guarde y reinténtalo.',
  send_failed: 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.',
  publication_failed: 'No se pudo publicar el presupuesto. Revisa sus datos e inténtalo de nuevo.',
  publication_missing: 'No se encontró la versión publicada. Recarga e inténtalo de nuevo.',
  publication_invalid: 'La versión publicada está incompleta. Contacta con soporte.',
}

type ErrorContext = { json?: () => Promise<{ error?: string }> }

/**
 * Sends an invoice or estimate to the client by email from the server (Resend).
 * Resolves true only when the server confirmed the send, so callers can update the status then.
 */
export async function sendDocument(kind: DocumentKind, id: string): Promise<boolean> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{ to?: string }>(
    'send-document',
    {
      body: { kind, id },
    },
  )
  if (error) {
    const code = await (error as { context?: ErrorContext }).context
      ?.json?.()
      .then((b) => b.error)
      .catch(() => undefined)
    toast.error('No se envió', {
      description:
        code === 'send_failed' && kind === 'estimate'
          ? 'El presupuesto quedó publicado, pero el correo no salió. Reinténtalo.'
          : (messages[code ?? ''] ?? messages.send_failed ?? 'No se pudo enviar.'),
    })
    return false
  }
  toast.success('Enviado', {
    description: data?.to ? `Correo enviado a ${data.to}.` : 'Correo enviado.',
  })
  return true
}
