import type { Client } from '@/shared/domain/types'
import { newId, updateTenantData } from '@/shared/store/store'

export type ClientInput = Omit<Client, 'id' | 'tenantId'>

/** Adds a client to the active company and returns its id. */
export function createClient(input: ClientInput): string {
  const id = newId('client')
  updateTenantData((data) => ({
    ...data,
    clients: [{ id, tenantId: data.tenant.id, ...input }, ...data.clients],
  }))
  return id
}

export function updateClient(id: string, input: ClientInput): void {
  updateTenantData((data) => ({
    ...data,
    clients: data.clients.map((c) => (c.id === id ? { ...c, ...input } : c)),
  }))
}
