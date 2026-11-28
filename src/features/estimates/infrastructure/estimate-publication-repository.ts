import type { Client, Estimate, Tenant } from '@/shared/domain/types'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { getSaveStatus } from '@/shared/store/store'
import {
  clientFromRow,
  estimateFromRow,
  tenantFromRow,
  type EstimateRow,
} from '@/shared/store/supabase-mappers'

import { estimateReminderUnavailable } from '../domain/estimate-reminder'

export type PublishedEstimate = {
  token: string
  snapshot: {
    estimate: { number: string; title: string; valid_until: string }
    client: { name: string }
    tenant: { name: string }
  }
}

export type PublishedEstimateDocument = {
  estimate: Estimate
  client: Client
  tenant: Tenant
  source: 'publication' | 'migration'
}

export async function loadPublishedEstimate(
  tenantId: string,
  estimateId: string,
): Promise<PublishedEstimateDocument> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('estimate_publications')
    .select('snapshot,source')
    .eq('tenant_id', tenantId)
    .eq('estimate_id', estimateId)
    .maybeSingle()
  if (error || !data) throw new Error(error?.message ?? 'Versión publicada no encontrada.')
  const snapshot = data.snapshot as {
    estimate: EstimateRow
    client: Record<string, unknown>
    tenant: Record<string, unknown>
  }
  if (!snapshot.estimate || !snapshot.client || !snapshot.tenant)
    throw new Error('La versión publicada está incompleta.')
  return {
    estimate: estimateFromRow(snapshot.estimate),
    client: clientFromRow(snapshot.client),
    tenant: tenantFromRow(snapshot.tenant),
    source: data.source as PublishedEstimateDocument['source'],
  }
}

/** Reads the existing link on explicit request. Never calls publish or updates the estimate. */
export async function loadEstimateReminder(tenantId: string, estimateId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const publication = await loadPublishedEstimate(tenantId, estimateId).catch(() => {
    throw new Error('No se pudo comprobar la versión publicada. Vuelve a intentarlo.')
  })
  const { data, error } = await createBrowserSupabaseClient()
    .from('estimates')
    .select('public_token,client_id')
    .eq('tenant_id', tenantId)
    .eq('id', estimateId)
    .eq('status', 'sent')
    .is('responded_at', null)
    .gte('valid_until', today)
    .maybeSingle()
  if (error) throw new Error('No se pudo comprobar el presupuesto. Vuelve a intentarlo.')
  if (!data || publication.estimate.validUntil < today) throw new Error(estimateReminderUnavailable)
  if (
    !data.public_token ||
    publication.estimate.id !== estimateId ||
    publication.estimate.tenantId !== tenantId ||
    publication.tenant.id !== tenantId ||
    publication.client.tenantId !== tenantId ||
    publication.client.id !== data.client_id
  ) {
    throw new Error('No se pudo verificar el enlace de este presupuesto.')
  }
  return {
    token: data.public_token as string,
    estimateNumber: publication.estimate.number,
    title: publication.estimate.title,
    company: publication.tenant.name,
    recipient: publication.client.name,
    clientId: data.client_id as string,
  }
}

/** Publishes once in Postgres; the status trigger captures the customer-facing version. */
export async function publishEstimate(
  tenantId: string,
  estimateId: string,
): Promise<PublishedEstimate> {
  if (getSaveStatus().state !== 'saved') {
    throw new Error('Espera a que termine el guardado antes de publicar el presupuesto.')
  }

  const db = createBrowserSupabaseClient()
  const { data: estimate, error: lookupError } = await db
    .from('estimates')
    .select('status,public_token')
    .eq('tenant_id', tenantId)
    .eq('id', estimateId)
    .maybeSingle()
  if (lookupError || !estimate)
    throw new Error(lookupError?.message ?? 'Presupuesto no encontrado.')

  if (estimate.status === 'draft') {
    const { error } = await db
      .from('estimates')
      .update({ status: 'sent' })
      .eq('tenant_id', tenantId)
      .eq('id', estimateId)
      .eq('status', 'draft')
    if (error) throw new Error(error.message)
  }

  const { data: publication, error: versionError } = await db
    .from('estimate_publications')
    .select('snapshot')
    .eq('tenant_id', tenantId)
    .eq('estimate_id', estimateId)
    .maybeSingle()
  if (versionError || !publication?.snapshot) {
    throw new Error(versionError?.message ?? 'La versión publicada no está disponible.')
  }
  return {
    token: estimate.public_token as string,
    snapshot: publication.snapshot as PublishedEstimate['snapshot'],
  }
}
