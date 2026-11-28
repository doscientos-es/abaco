import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { PortalDocument, PortalVisit } from '../domain/customer-portal'

export type PortalActiveLink = {
  id: string
  createdAt: string
  expiresAt: string
  blockedAt?: string | null
}
export type PortalOfficeOptions = {
  clientActive: boolean
  visits: (PortalVisit & { id: string; officeTitle: string })[]
  documents: { id: string; officeTitle: string; document: PortalDocument }[]
  activeLinks: PortalActiveLink[]
}

export async function listClientPortalOptions(
  tenantId: string,
  clientId: string,
): Promise<PortalOfficeOptions> {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_client_portal_options', {
    p_tenant_id: tenantId,
    p_client_id: clientId,
  })
  if (error || !data) throw new Error('No se pudieron cargar las opciones para compartir.')
  return data as PortalOfficeOptions
}

export async function createClientPortalGrant(
  tenantId: string,
  clientId: string,
  tokenHash: string,
  visits: string[],
  documents: string[],
): Promise<PortalActiveLink> {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_client_portal_grant', {
    p_tenant_id: tenantId,
    p_client_id: clientId,
    p_token_hash: tokenHash,
    p_visits: visits,
    p_documents: documents,
  })
  if (error?.code === '22023')
    throw new Error('La selección ha cambiado. Revisa las opciones disponibles.')
  if (error?.code === '54000')
    throw new Error('Hay cinco enlaces activos. Revoca uno antes de crear otro.')
  if (error || !data)
    throw new Error(
      'No se pudo verificar la creación. Revisa los enlaces activos antes de volver a intentarlo.',
    )
  return data as PortalActiveLink
}

export async function revokeClientPortalGrant(tenantId: string, clientId: string, grantId: string) {
  const { error } = await createBrowserSupabaseClient().rpc('revoke_client_portal_grant', {
    p_tenant_id: tenantId,
    p_client_id: clientId,
    p_grant_id: grantId,
  })
  if (error) throw new Error('No se pudo revocar el enlace. Inténtalo de nuevo.')
}
