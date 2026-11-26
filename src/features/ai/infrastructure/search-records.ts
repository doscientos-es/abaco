import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { estimateTotals } from '@/shared/domain/estimate'
import { estimateFromRow, type EstimateRow } from '@/shared/store/supabase-mappers'

import type { searchRecordsSchema } from '../domain/chat-tools'

type SearchInput = z.infer<typeof searchRecordsSchema>
type Row = Record<string, unknown> & { id: string }
const limit = 10
const lineLimit = 5

// Quote PostgREST filter values so punctuation cannot introduce additional filters.
function pattern(query: string) {
  return `"%${query.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"')}%"`
}

export async function searchRecords(client: SupabaseClient, tenantId: string, input: SearchInput) {
  const { type, query, clientId, status, recordId } = input
  const columns =
    type === 'clientes'
      ? 'id,name,tax_id,email,phone,address,billing_address,notes'
      : type === 'presupuestos'
        ? 'id,tenant_id,number,title,status,client_id,vat_rate,discount_type,discount_value,valid_until,created_at,document_format,document_sections,estimate_lines(id,estimate_id,kind,description,details,quantity,unit,unit_price_cents,discount_percent,position)'
        : 'id,name,sku,kind,category,unit,unit_price_cents'
  const table =
    type === 'clientes' ? 'clients' : type === 'presupuestos' ? 'estimates' : 'catalog_items'
  let request = client.from(table).select(columns).eq('tenant_id', tenantId)
  if (recordId) request = request.eq('id', recordId)
  if (type === 'clientes') request = request.is('archived_at', null)
  if (type === 'inventario') request = request.eq('kind', 'material')
  if (type === 'presupuestos' && clientId) request = request.eq('client_id', clientId)
  if (type === 'presupuestos' && status) request = request.eq('status', status)
  if (query) {
    const fields =
      type === 'clientes'
        ? ['name', 'tax_id', 'email', 'phone']
        : type === 'presupuestos'
          ? ['number', 'title']
          : ['name', 'sku', 'category']
    request = request.or(fields.map((field) => `${field}.ilike.${pattern(query)}`).join(','))
  }
  request = request
    .order(type === 'presupuestos' ? 'created_at' : 'name', { ascending: type !== 'presupuestos' })
    .limit(limit + 1)
  if (type === 'presupuestos')
    request = request
      .order('position', { referencedTable: 'estimate_lines' })
      .limit(recordId ? 501 : lineLimit + 1, { referencedTable: 'estimate_lines' })
  const { data, error } = await request
  if (error) throw new Error('No se pudieron consultar los datos.')
  const rows = (data ?? []) as unknown as Row[]
  const selected = rows.slice(0, limit)
  if (type === 'inventario' && selected.length) {
    const stock = await client
      .from('inventory_items')
      .select('catalog_item_id,quantity')
      .eq('tenant_id', tenantId)
      .in(
        'catalog_item_id',
        selected.map((row) => row.id),
      )
    if (stock.error) throw new Error('No se pudo consultar el stock.')
    const quantities = new Map(
      (stock.data ?? []).map((item) => [item.catalog_item_id, item.quantity]),
    )
    return {
      type,
      matches: selected.map((row) => ({ ...row, stock: quantities.get(row.id) ?? null })),
      truncated: rows.length > limit,
    }
  }
  return {
    type,
    matches: selected.map((row) => {
      if (type === 'clientes')
        return {
          ...row,
          notes: typeof row.notes === 'string' ? row.notes.slice(0, 500) : row.notes,
          notesTruncated: typeof row.notes === 'string' && row.notes.length > 500,
        }
      if (type !== 'presupuestos') return row
      const lines = Array.isArray(row.estimate_lines) ? row.estimate_lines : []
      let totalCents: number | null = null
      if (lines.length <= (recordId ? 500 : lineLimit)) {
        try {
          totalCents = estimateTotals(
            estimateFromRow({
              ...row,
              estimate_lines: lines as EstimateRow['estimate_lines'],
              estimate_milestones: null,
            }),
          ).totalCents
        } catch {
          // Invalid legacy documents cannot yield a reliable total.
        }
      }
      const { document_sections: _sections, ...summary } = row
      return {
        ...summary,
        name: `${typeof row.number === 'string' ? row.number : ''} · ${typeof row.title === 'string' ? row.title : ''}`,
        totalCents,
        estimate_lines: lines.slice(0, lineLimit).map((line) => ({
          ...line,
          details: typeof line.details === 'string' ? line.details.slice(0, 100) : line.details,
          detailsTruncated: typeof line.details === 'string' && line.details.length > 100,
        })),
        moreLines: lines.length > lineLimit,
      }
    }),
    truncated: rows.length > limit,
  }
}
