/** Money is always stored as integer cents to avoid floating point drift. */
export type Cents = number

export type Tenant = {
  id: string
  /** Trade name shown in the app and in messages. */
  name: string
  /** Registered company name (razón social) for invoices. */
  legalName?: string
  taxId: string
  email: string
  phone: string
  address?: string
  postalCode?: string
  city?: string
  website?: string
  iban?: string
  /** Branding applied to documents and emails. Empty means the Ábaco default look. */
  brandColor?: string
  logoUrl?: string
  emailFromName?: string
  emailSignature?: string
  invoiceEmailIntro?: string
  estimateEmailIntro?: string
  documentFooter?: string
  defaultVatRate: number
  defaultDepositPercent: number
  nextEstimateNumber: number
}

export type Client = {
  id: string
  tenantId: string
  name: string
  taxId: string
  email: string
  phone: string
  address: string
  notes: string
}

export type CatalogKind = 'material' | 'labor' | 'other'

export type CatalogItem = {
  id: string
  tenantId: string
  sku: string
  name: string
  kind: CatalogKind
  category: string
  unit: string
  unitPriceCents: Cents
}

export type EstimateLine = {
  id: string
  catalogItemId: string | null
  description: string
  kind: CatalogKind
  unit: string
  quantity: number
  unitPriceCents: Cents
  /** Percentage taken off this line (0..100). */
  discountPercent: number
}

export type Milestone = {
  id: string
  label: string
  description?: string
  percent: number
}

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export type Estimate = {
  id: string
  tenantId: string
  number: string
  clientId: string
  title: string
  status: EstimateStatus
  lines: EstimateLine[]
  /** Whole-estimate discount: a percentage, or an amount in cents. */
  discountType: 'none' | 'percent' | 'amount'
  discountValue: number
  vatRate: number
  milestones: Milestone[]
  clauses: string
  validUntil: string
  createdAt: string
  /** Secret of the public link; owned by the database, so it is absent on estimates not yet saved. */
  publicToken?: string
  /** Set when the client accepted or rejected through the public link. */
  respondedAt?: string
  respondedBy?: string
}

export type LedgerKind = 'income' | 'expense'

export type LedgerEntry = {
  id: string
  tenantId: string
  kind: LedgerKind
  date: string
  concept: string
  category: string
  amountCents: Cents
  /** Gross amount including VAT. */
  vatRate: number
  estimateId: string | null
  milestoneId: string | null
}

export type InvoiceStatus = 'issued' | 'sent' | 'paid'

/** Invoice generated from one payment milestone of an estimate. */
export type Invoice = {
  id: string
  tenantId: string
  number: string
  estimateId: string
  milestoneId: string
  clientId: string
  concept: string
  /** Gross amount including VAT. */
  totalCents: Cents
  /** Sum of the payments received so far (gross). The invoice is paid when it reaches the total. */
  paidCents: Cents
  vatRate: number
  status: InvoiceStatus
  issuedAt: string
  dueDate: string
}

export type TenantData = {
  tenant: Tenant
  clients: Client[]
  catalog: CatalogItem[]
  estimates: Estimate[]
  ledger: LedgerEntry[]
  invoices: Invoice[]
}
