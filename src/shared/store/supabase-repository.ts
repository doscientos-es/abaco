import type { SupabaseClient } from '@supabase/supabase-js'

import type { TenantData } from '../domain/types'
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
import type { AppState, TenantRepository } from './store'

type Row = Record<string, unknown> & { id: string }

/**
 * Supabase adapter for the repository port. Row Level Security decides what each role can
 * read and write, so every query here is unfiltered; a role without access simply gets no rows.
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

  async function upsert(table: string, rows: Row[]): Promise<void> {
    if (rows.length === 0) return
    const { error } = await supabase.from(table).upsert(rows)
    if (error) throw new Error(`${table}: ${error.message}`)
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
    milestones: data.estimates.flatMap((e) => e.milestones.map((m, i) => milestoneToRow(e, m, i))) as Row[],
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
    // Children are deleted before parents and written after them (foreign keys).
    await remove('invoices', d.invoices.removed)
    await remove('ledger_entries', d.ledger.removed)
    await remove('estimate_lines', d.lines.removed)
    await remove('estimate_milestones', d.milestones.removed)
    await remove('estimates', d.estimates.removed)
    await remove('catalog_items', d.catalog.removed)
    await remove('clients', d.clients.removed)

    if (JSON.stringify(tenantToRow(before.tenant)) !== JSON.stringify(tenantToRow(after.tenant))) {
      const { id, ...settings } = tenantToRow(after.tenant)
      const { error } = await supabase.from('tenants').update(settings).eq('id', id as string)
      if (error) throw new Error(`tenants: ${error.message}`)
    }
    await upsert('clients', d.clients.changed)
    await upsert('catalog_items', d.catalog.changed)
    await upsert('estimates', d.estimates.changed)
    await upsert('estimate_milestones', d.milestones.changed)
    await upsert('estimate_lines', d.lines.changed)
    await upsert('ledger_entries', d.ledger.changed)
    await upsert('invoices', d.invoices.changed)

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
