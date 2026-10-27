import type { SupabaseClient } from '@supabase/supabase-js'

import type { TenantData } from '../domain/types'
import type { AppState, TenantRepository } from './store'
import {
  catalogFromRow,
  catalogToRow,
  clientFromRow,
  clientToRow,
  estimateFromRow,
  estimateToRow,
  invoiceFromRow,
  invoiceToRow,
  ledgerFromRow,
  ledgerToRow,
  lineToRow,
  milestoneToRow,
  tenantFromRow,
  tenantToRow,
  type EstimateRow,
} from './supabase-mappers'

type Row = Record<string, unknown> & { id: string }

/**
 * Supabase adapter for the repository port. RLS remains the authority for every row.
 */
export function createSupabaseRepository(supabase: SupabaseClient): TenantRepository {
  async function select(table: string, columns = '*'): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from(table).select(columns)
    if (error) throw new Error(`${table}: ${error.message}`)
    return data as unknown as Record<string, unknown>[]
  }

  const byTenant = <T extends { tenantId: string }>(items: T[], tenantId: string) =>
    items.filter((item) => item.tenantId === tenantId)

  async function load(): Promise<AppState> {
    const [tenants, clients, catalog, estimates, ledger, invoices] = await Promise.all([
      select('tenants'),
      select('clients'),
      select('catalog_items'),
      select('estimates', '*, estimate_lines(*), estimate_milestones(*)'),
      select('ledger_entries'),
      select('invoices'),
    ])
    const allClients = clients.map(clientFromRow)
    const allCatalog = catalog.map(catalogFromRow)
    const allEstimates = estimates.map((row) => estimateFromRow(row as EstimateRow))
    const allLedger = ledger.map(ledgerFromRow)
    const allInvoices = invoices.map(invoiceFromRow)

    const data: Record<string, TenantData> = {}
    for (const row of tenants) {
      const tenant = tenantFromRow(row)
      data[tenant.id] = {
        tenant,
        clients: byTenant(allClients, tenant.id),
        catalog: byTenant(allCatalog, tenant.id),
        estimates: byTenant(allEstimates, tenant.id),
        ledger: byTenant(allLedger, tenant.id),
        invoices: byTenant(allInvoices, tenant.id),
      }
    }
    const activeTenantId = Object.keys(data)[0]
    if (!activeTenantId) throw new Error('Tu usuario no pertenece a ninguna empresa.')
    return { activeTenantId, tenants: data }
  }

  async function write(table: string, rows: Row[], previous: Row[]): Promise<void> {
    const existing = new Set(previous.map((row) => row.id))
    for (const row of rows) {
      const { id, ...values } = row
      if (existing.has(id)) {
        // Server-owned numbers and creation timestamps must never travel through an update.
        const { number: _number, created_at: _createdAt, ...editable } = values
        const { data, error } = await supabase
          .from(table)
          .update(editable)
          .eq('id', id)
          .select('id')
        if (error) throw new Error(`${table}: ${error.message}`)
        if (!data?.length)
          throw new Error(`${table}: el registro ya no existe o no tienes permiso para editarlo.`)
      } else {
        const { number: _number, created_at: _createdAt, ...insertable } = values
        const { error } = await supabase.from(table).insert({ id, ...insertable })
        if (error?.code === '23505') {
          // A preceding retry may have inserted this row before a later step failed.
          // Reusing its stable id must preserve its server-assigned document number.
          const { data, error: lookupError } = await supabase
            .from(table)
            .select('id, tenant_id')
            .eq('id', id)
            .maybeSingle()
          if (lookupError || !data || data.tenant_id !== row.tenant_id)
            throw new Error(`${table}: ${error.message}`)
          const { data: updated, error: updateError } = await supabase
            .from(table)
            .update(insertable)
            .eq('id', id)
            .select('id')
          if (updateError || !updated?.length)
            throw new Error(
              `${table}: ${updateError?.message ?? 'no se pudo reintentar el guardado.'}`,
            )
        } else if (error) {
          throw new Error(`${table}: ${error.message}`)
        }
      }
    }
  }

  async function remove(table: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const { error } = await supabase.from(table).delete().in('id', ids)
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  /** Rows that are new or changed, and ids that disappeared, between two snapshots. */
  function diff(before: Row[], after: Row[]) {
    const old = new Map(before.map((row) => [row.id, JSON.stringify(row)]))
    const keep = new Set(after.map((row) => row.id))
    return {
      changed: after.filter((row) => old.get(row.id) !== JSON.stringify(row)),
      removed: before.filter((row) => !keep.has(row.id)).map((row) => row.id),
    }
  }

  const rows = (data: TenantData) => ({
    clients: data.clients.map(clientToRow) as Row[],
    catalog: data.catalog.map(catalogToRow) as Row[],
    estimates: data.estimates.map(estimateToRow) as Row[],
    lines: data.estimates.flatMap((e) => e.lines.map((l, i) => lineToRow(e, l, i))) as Row[],
    milestones: data.estimates.flatMap((e) =>
      e.milestones.map((m, i) => milestoneToRow(e, m, i)),
    ) as Row[],
    ledger: data.ledger.map(ledgerToRow) as Row[],
    invoices: data.invoices.map(invoiceToRow) as Row[],
  })

  async function saveTenant(before: TenantData, after: TenantData): Promise<boolean> {
    const a = rows(before)
    const b = rows(after)
    const d = {
      clients: diff(a.clients, b.clients),
      catalog: diff(a.catalog, b.catalog),
      estimates: diff(a.estimates, b.estimates),
      lines: diff(a.lines, b.lines),
      milestones: diff(a.milestones, b.milestones),
      ledger: diff(a.ledger, b.ledger),
      invoices: diff(a.invoices, b.invoices),
    }
    if (d.clients.removed.length) {
      throw new Error('Los clientes se archivan para conservar instalaciones y documentos.')
    }
    // Children are deleted before parents and written after them (foreign keys).
    await remove('invoices', d.invoices.removed)
    await remove('ledger_entries', d.ledger.removed)
    await remove('estimate_lines', d.lines.removed)
    await remove('estimate_milestones', d.milestones.removed)
    await remove('estimates', d.estimates.removed)
    await remove('catalog_items', d.catalog.removed)

    if (JSON.stringify(tenantToRow(before.tenant)) !== JSON.stringify(tenantToRow(after.tenant))) {
      const { id, ...settings } = tenantToRow(after.tenant)
      const { error } = await supabase
        .from('tenants')
        .update(settings)
        .eq('id', id as string)
      if (error) throw new Error(`tenants: ${error.message}`)
    }
    await write('clients', d.clients.changed, a.clients)
    await write('catalog_items', d.catalog.changed, a.catalog)
    await write('estimates', d.estimates.changed, a.estimates)
    await write('estimate_milestones', d.milestones.changed, a.milestones)
    await write('estimate_lines', d.lines.changed, a.lines)
    await write('ledger_entries', d.ledger.changed, a.ledger)
    await write('invoices', d.invoices.changed, a.invoices)

    const inserted = (changed: Row[], previous: Row[]) =>
      changed.some((row) => !previous.some((p) => p.id === row.id))
    return inserted(d.estimates.changed, a.estimates) || inserted(d.invoices.changed, a.invoices)
  }

  return {
    load,
    async save(previous, next) {
      let numbered = false
      for (const [id, after] of Object.entries(next.tenants)) {
        const before = previous.tenants[id]
        if (!before || before === after) continue
        numbered = (await saveTenant(before, after)) || numbered
      }
      // New estimates and invoices get their number from the database; reload to show it.
      return numbered ? load() : undefined
    },
  }
}
