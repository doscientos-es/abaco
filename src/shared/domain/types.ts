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
  /** Opt-in: the daily job emails clients about overdue invoices and estimates about to expire. */
  autoReminders?: boolean
  /** Weekly email to the owner with invoiced, pending and open estimates. On unless turned off. */
  weeklySummary?: boolean
  defaultVatRate: number
  defaultDepositPercent: number
  nextEstimateNumber: number
}

export type ClientKind = 'person' | 'community' | 'business'

export type Client = {
  id: string
  tenantId: string
  name: string
  kind?: ClientKind
  taxId: string
  email: string
  phone: string
  address: string
  billingAddress?: string
  archivedAt?: string | null
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
  /** Conversion route agreed in the published proposal. Legacy proposals use work. */
  conversionDestination?: 'work' | 'contract'
  contractBillingFrequency?: 'monthly' | 'quarterly' | 'yearly'
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
  /** Recorded only after the email provider confirms an estimate send. */
  emailSentAt?: string
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

export type InvoiceSnapshot = {
  source: 'issuance' | 'migration'
  capturedAt: string
  issuer: {
    name: string
    legalName: string
    taxId: string
    email: string
    phone: string
    address: string
    postalCode: string
    city: string
    website: string
    iban: string
    brandColor: string
    logoUrl: string
    documentFooter: string
  }
  client: { name: string; taxId: string; address: string; email: string }
  estimateNumber: string
  workTitle?: string
  extraDescription?: string
  contractTitle?: string
  contractPeriodStart?: string
  contractPeriodEnd?: string
}

/** Issued invoice from one estimate milestone, approved work extra, or contract period. */
export type Invoice = {
  id: string
  tenantId: string
  number: string
  estimateId: string | null
  milestoneId: string | null
  workExtraId: string | null
  contractPeriodId?: string | null
  clientId: string
  concept: string
  /** Gross amount including VAT. */
  totalCents: Cents
  /** Sum of the payments received so far (gross). The invoice is paid when it reaches the total. */
  paidCents: Cents
  vatRate: number
  /** Display summary derived from payment balance and accepted email delivery. */
  status: InvoiceStatus
  /** The legal document remains issued after delivery and settlement. */
  documentStatus: 'issued'
  emailAcceptedAt: string | null
  issuedAt: string
  dueDate: string
  /** Issuer and recipient as captured at issuance; legacy rows are marked as migration reconstructions. */
  snapshot?: InvoiceSnapshot
}

export type TenantData = {
  tenant: Tenant
  clients: Client[]
  catalog: CatalogItem[]
  estimates: Estimate[]
  ledger: LedgerEntry[]
  invoices: Invoice[]
}
