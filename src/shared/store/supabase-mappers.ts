import type {
  CatalogItem,
  Client,
  Estimate,
  EstimateLine,
  Invoice,
  LedgerEntry,
  Milestone,
  Tenant,
} from '../domain/types'

/**
 * Translation between Postgres rows (snake_case) and the frontend model (camelCase).
 * Columns the database owns (document numbers, counters, timestamps) are never written back
 * from here, except `number`, which the insert trigger overwrites anyway.
 */

type Row = Record<string, unknown>

export type LineRow = Row & { id: string; estimate_id: string }
export type MilestoneRow = Row & { id: string; estimate_id: string }
export type EstimateRow = Row & {
  estimate_lines: LineRow[] | null
  estimate_milestones: MilestoneRow[] | null
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const num = (value: unknown): number => Number(value ?? 0)
/** Optional model fields are omitted (not undefined) when the column is null or empty. */
function present<K extends string>(key: K, value: unknown): { [P in K]?: string } {
  return typeof value === 'string' && value ? ({ [key]: value } as { [P in K]?: string }) : {}
}

export function tenantFromRow(row: Row): Tenant {
  return {
    id: str(row.id),
    name: str(row.name),
    taxId: str(row.tax_id),
    email: str(row.email),
    phone: str(row.phone),
    defaultVatRate: num(row.default_vat_rate),
    defaultDepositPercent: num(row.default_deposit_percent),
    nextEstimateNumber: num(row.next_estimate_number),
    ...present('legalName', row.legal_name),
    ...present('address', row.address),
    ...present('postalCode', row.postal_code),
    ...present('city', row.city),
    ...present('website', row.website),
    ...present('iban', row.iban),
    ...present('brandColor', row.brand_color),
    ...present('logoUrl', row.logo_url),
    ...present('emailFromName', row.email_from_name),
    ...present('emailSignature', row.email_signature),
    ...present('invoiceEmailIntro', row.invoice_email_intro),
    ...present('estimateEmailIntro', row.estimate_email_intro),
    ...present('documentFooter', row.document_footer),
  }
}

/** Editable company settings only; the numbering counters belong to the database. */
export function tenantToRow(tenant: Tenant): Row {
  return {
    id: tenant.id,
    name: tenant.name,
    legal_name: tenant.legalName ?? null,
    tax_id: tenant.taxId,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address ?? null,
    postal_code: tenant.postalCode ?? null,
    city: tenant.city ?? null,
    website: tenant.website ?? null,
    iban: tenant.iban ?? null,
    brand_color: tenant.brandColor || null,
    logo_url: tenant.logoUrl || null,
    email_from_name: tenant.emailFromName || null,
    email_signature: tenant.emailSignature || null,
    invoice_email_intro: tenant.invoiceEmailIntro || null,
    estimate_email_intro: tenant.estimateEmailIntro || null,
    document_footer: tenant.documentFooter || null,
    default_vat_rate: tenant.defaultVatRate,
    default_deposit_percent: tenant.defaultDepositPercent,
  }
}

export function clientFromRow(row: Row): Client {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    name: str(row.name),
    taxId: str(row.tax_id),
    email: str(row.email),
    phone: str(row.phone),
    address: str(row.address),
    notes: str(row.notes),
  }
}

export const clientToRow = (c: Client): Row => ({
  id: c.id,
  tenant_id: c.tenantId,
  name: c.name,
  tax_id: c.taxId,
  email: c.email,
  phone: c.phone,
  address: c.address,
  notes: c.notes,
})

export function catalogFromRow(row: Row): CatalogItem {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    sku: str(row.sku),
    name: str(row.name),
    kind: str(row.kind) as CatalogItem['kind'],
    category: str(row.category),
    unit: str(row.unit),
    unitPriceCents: num(row.unit_price_cents),
  }
}

export const catalogToRow = (i: CatalogItem): Row => ({
  id: i.id,
  tenant_id: i.tenantId,
  sku: i.sku,
  name: i.name,
  kind: i.kind,
  category: i.category,
  unit: i.unit,
  unit_price_cents: i.unitPriceCents,
})

export function estimateFromRow(row: EstimateRow): Estimate {
  const lines = [...(row.estimate_lines ?? [])].sort((a, b) => num(a.position) - num(b.position))
  const milestones = [...(row.estimate_milestones ?? [])].sort((a, b) => num(a.position) - num(b.position))
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    number: str(row.number),
    clientId: str(row.client_id),
    title: str(row.title),
    status: str(row.status) as Estimate['status'],
    vatRate: num(row.vat_rate),
    discountType: (['percent', 'amount'].includes(str(row.discount_type))
      ? str(row.discount_type)
      : 'none') as Estimate['discountType'],
    discountValue: num(row.discount_value),
    clauses: str(row.clauses),
    validUntil: str(row.valid_until),
    createdAt: str(row.created_at).slice(0, 10),
    lines: lines.map(
      (l): EstimateLine => ({
        id: str(l.id),
        catalogItemId: typeof l.catalog_item_id === 'string' ? l.catalog_item_id : null,
        description: str(l.description),
        kind: str(l.kind) as EstimateLine['kind'],
        unit: str(l.unit),
        quantity: num(l.quantity),
        unitPriceCents: num(l.unit_price_cents),
        discountPercent: num(l.discount_percent),
      }),
    ),
    milestones: milestones.map(
      (m): Milestone => ({
        id: str(m.id),
        label: str(m.label),
        percent: num(m.percent),
        ...present('description', m.description),
      }),
    ),
  }
}

export const estimateToRow = (e: Estimate): Row => ({
  id: e.id,
  tenant_id: e.tenantId,
  number: e.number,
  client_id: e.clientId,
  title: e.title,
  status: e.status,
  vat_rate: e.vatRate,
  discount_type: e.discountType,
  discount_value: e.discountType === 'none' ? 0 : e.discountValue,
  clauses: e.clauses,
  valid_until: e.validUntil,
})

export const lineToRow = (e: Estimate, l: EstimateLine, position: number): Row => ({
  id: l.id,
  tenant_id: e.tenantId,
  estimate_id: e.id,
  catalog_item_id: l.catalogItemId,
  position,
  description: l.description,
  kind: l.kind,
  unit: l.unit,
  quantity: l.quantity,
  unit_price_cents: l.unitPriceCents,
  discount_percent: l.discountPercent,
})

export const milestoneToRow = (e: Estimate, m: Milestone, position: number): Row => ({
  id: m.id,
  tenant_id: e.tenantId,
  estimate_id: e.id,
  position,
  label: m.label,
  description: m.description ?? null,
  percent: m.percent,
})

export function ledgerFromRow(row: Row): LedgerEntry {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    kind: str(row.kind) as LedgerEntry['kind'],
    date: str(row.entry_date),
    concept: str(row.concept),
    category: str(row.category),
    amountCents: num(row.amount_cents),
    vatRate: num(row.vat_rate),
    estimateId: typeof row.estimate_id === 'string' ? row.estimate_id : null,
    milestoneId: typeof row.milestone_id === 'string' ? row.milestone_id : null,
  }
}

export const ledgerToRow = (l: LedgerEntry): Row => ({
  id: l.id,
  tenant_id: l.tenantId,
  kind: l.kind,
  entry_date: l.date,
  concept: l.concept,
  category: l.category,
  amount_cents: l.amountCents,
  vat_rate: l.vatRate,
  estimate_id: l.estimateId,
  milestone_id: l.milestoneId,
})

export function invoiceFromRow(row: Row): Invoice {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    number: str(row.number),
    estimateId: str(row.estimate_id),
    milestoneId: str(row.milestone_id),
    clientId: str(row.client_id),
    concept: str(row.concept),
    totalCents: num(row.total_cents),
    vatRate: num(row.vat_rate),
    status: str(row.status) as Invoice['status'],
    issuedAt: str(row.issued_at),
    dueDate: str(row.due_date),
  }
}

export const invoiceToRow = (i: Invoice): Row => ({
  id: i.id,
  tenant_id: i.tenantId,
  number: i.number,
  estimate_id: i.estimateId,
  milestone_id: i.milestoneId,
  client_id: i.clientId,
  concept: i.concept,
  total_cents: i.totalCents,
  vat_rate: i.vatRate,
  status: i.status,
  issued_at: i.issuedAt,
  due_date: i.dueDate,
})
