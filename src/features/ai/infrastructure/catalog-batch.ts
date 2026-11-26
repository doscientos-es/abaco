import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { formLimits } from '@/shared/domain/form-limits'
import { parseEuros } from '@/shared/domain/money'
import { catalogFromRow } from '@/shared/store/supabase-mappers'

import type { catalogCreateProposalSchema, catalogPriceProposalSchema } from '../domain/chat-tools'

type Material = z.infer<typeof catalogCreateProposalSchema>['items'][number]
type PriceProposal = z.infer<typeof catalogPriceProposalSchema>
type CatalogRow = ReturnType<typeof catalogFromRow> & { version: string }
export type PriceChange = { item: CatalogRow; newPrice: number }

/** Reject invalid or excessive input rather than letting parseEuros turn it into zero. */
export function parseMaterialPrice(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(trimmed)) return null
  const cents = parseEuros(trimmed)
  return Number.isSafeInteger(cents) && cents <= Math.round(formLimits.monetaryAmount * 100)
    ? cents
    : null
}

/** Keyset pagination avoids silently treating the API's row limit as the whole catalogue. */
export async function loadCatalog(db: SupabaseClient, tenantId: string): Promise<CatalogRow[]> {
  const items: CatalogRow[] = []
  let lastId = ''
  for (;;) {
    let query = db
      .from('catalog_items')
      .select('id,tenant_id,sku,name,kind,category,unit,unit_price_cents,updated_at')
      .eq('tenant_id', tenantId)
      .order('id')
      .limit(200)
    if (lastId) query = query.gt('id', lastId)
    const { data, error } = await query
    if (error || !data) throw new Error('No se pudo cargar el catálogo completo.')
    for (const row of data) {
      if (typeof row.updated_at !== 'string' || typeof row.id !== 'string')
        throw new Error('El catálogo contiene datos no válidos.')
      items.push({ ...catalogFromRow(row), version: row.updated_at })
    }
    if (items.length > 5000)
      throw new Error('El catálogo supera el límite de 5000 artículos por operación.')
    if (data.length < 200) return items
    const nextId = data.at(-1)?.id
    if (typeof nextId !== 'string' || nextId <= lastId)
      throw new Error('No se pudo paginar el catálogo.')
    lastId = nextId
  }
}

export function planPriceChanges(items: CatalogRow[], proposal: PriceProposal): PriceChange[] {
  return items
    .filter(
      (item) =>
        (proposal.kind === 'all' || item.kind === proposal.kind) &&
        (proposal.category === null ||
          item.category.toLocaleLowerCase('es') === proposal.category.toLocaleLowerCase('es')),
    )
    .map((item) => {
      if (!Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0)
        throw new Error('El catálogo contiene un precio no válido.')
      const cents =
        (BigInt(item.unitPriceCents) * BigInt(10000 + proposal.basisPoints) + 5000n) / 10000n
      if (cents > BigInt(Math.round(formLimits.monetaryAmount * 100)))
        throw new Error(`El precio de ${item.name} supera el máximo permitido.`)
      return { item, newPrice: Number(cents) }
    })
}

export function duplicateMaterials(items: Material[], existing: CatalogRow[]): string[] {
  const names = new Set(existing.map((item) => item.name.trim().toLocaleLowerCase('es')))
  const skus = new Set(
    existing.map((item) => item.sku.trim().toLocaleLowerCase('es')).filter(Boolean),
  )
  const duplicates: string[] = []
  for (const item of items) {
    const name = item.name.trim().toLocaleLowerCase('es')
    const sku = (item.sku ?? '').trim().toLocaleLowerCase('es')
    if (names.has(name) || (sku && skus.has(sku))) duplicates.push(item.name)
    names.add(name)
    if (sku) skus.add(sku)
  }
  return duplicates
}

/** A single insert request is atomic. Caller checks duplicates against a fresh catalogue. */
export async function createMaterials(db: SupabaseClient, tenantId: string, items: Material[]) {
  if (items.some((item) => item.unitPriceCents === null)) throw new Error('Faltan precios.')
  const { error } = await db.from('catalog_items').insert(
    items.map((item) => ({
      tenant_id: tenantId,
      name: item.name,
      sku: item.sku ?? '',
      kind: 'material',
      category: item.category ?? '',
      unit: item.unit ?? 'ud',
      unit_price_cents: item.unitPriceCents,
    })),
  )
  if (error)
    throw new Error(
      'No se pudo confirmar la creación. Comprueba el catálogo antes de volver a intentarlo.',
    )
}

/** Each update is conditional on the reviewed version; errors can leave a partial batch. */
export async function applyPriceChanges(
  db: SupabaseClient,
  tenantId: string,
  changes: PriceChange[],
) {
  let applied = 0
  for (const { item, newPrice } of changes) {
    if (newPrice === item.unitPriceCents) continue
    try {
      const { data, error } = await db
        .from('catalog_items')
        .update({ unit_price_cents: newPrice })
        .eq('tenant_id', tenantId)
        .eq('id', item.id)
        .eq('updated_at', item.version)
        .select('id')
      if (error || !data?.length) {
        return { applied, complete: false, uncertain: Boolean(error), failed: item.name }
      }
    } catch {
      return { applied, complete: false, uncertain: true, failed: item.name }
    }
    applied++
  }
  return { applied, complete: true, uncertain: false, failed: '' }
}
