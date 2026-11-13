type Party = Record<string, string | null>

export type ContractInvoiceEmailPayload = {
  invoice: {
    number: string
    concept: string
    total_cents: number
    vat_rate: number
    issued_at: string
    due_date: string
    document_snapshot: {
      issuer: Party
      client: Party
      contractTitle?: string | null
      contractPeriodStart?: string | null
      contractPeriodEnd?: string | null
    }
  }
  intro: string | null
  signature: string | null
  from_name: string
}

const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const euros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** The entire fiscal document comes from the immutable issuance snapshot, not live client data. */
export function contractInvoiceEmail(payload: ContractInvoiceEmailPayload) {
  const { invoice } = payload
  const { issuer, client, contractTitle, contractPeriodStart, contractPeriodEnd } =
    invoice.document_snapshot
  const to = client.email?.trim() ?? ''
  if (!emailPattern.test(to)) throw new Error('email_missing')
  if (
    !issuer.name ||
    !client.name ||
    !Number.isSafeInteger(invoice.total_cents) ||
    invoice.total_cents <= 0 ||
    !Number.isFinite(invoice.vat_rate) ||
    invoice.vat_rate < 0 ||
    invoice.vat_rate > 100
  )
    throw new Error('invoice_invalid')
  const base = Math.round(invoice.total_cents / (1 + invoice.vat_rate / 100))
  const text = [
    `Hola ${client.name},`,
    '',
    ...(payload.intro?.trim() ? [payload.intro.trim(), ''] : []),
    `Factura ${invoice.number}`,
    `Emisión: ${invoice.issued_at}. Vencimiento: ${invoice.due_date}.`,
    '',
    `Emisor: ${issuer.legalName || issuer.name}`,
    ...(issuer.taxId ? [`NIF / CIF: ${issuer.taxId}`] : []),
    ...[
      issuer.address,
      [issuer.postalCode, issuer.city].filter(Boolean).join(' '),
      issuer.email,
      issuer.phone,
    ].filter(Boolean),
    '',
    `Cliente: ${client.name}`,
    ...(client.taxId ? [`NIF / CIF: ${client.taxId}`] : []),
    ...[client.address, to].filter(Boolean),
    '',
    ...(contractTitle ? [`Contrato: ${contractTitle}`] : []),
    ...(contractPeriodStart && contractPeriodEnd
      ? [`Periodo: ${contractPeriodStart} – ${contractPeriodEnd}`]
      : []),
    invoice.concept,
    `Base imponible: ${euros(base)}.`,
    `IVA ${invoice.vat_rate}%: ${euros(invoice.total_cents - base)}.`,
    `Total factura: ${euros(invoice.total_cents)} (IVA incluido).`,
    '',
    ...(issuer.iban
      ? [
          `Transferencia bancaria: ${issuer.iban}.`,
          `Concepto de la transferencia: ${invoice.number}.`,
        ]
      : []),
    ...(issuer.documentFooter ? [issuer.documentFooter, ''] : []),
    payload.signature?.trim() || issuer.name,
  ].join('\n')
  const color = /^#[0-9a-f]{6}$/i.test(issuer.brandColor ?? '') ? issuer.brandColor : '#2a4227'
  const html = `<div style="font-family:Arial,sans-serif;color:#1a1a1a;border-top:4px solid ${color};padding:16px"><h1>Factura ${escapeHtml(invoice.number)}</h1>${text
    .split('\n')
    .map((line) =>
      line ? `<p style="margin:0 0 8px;white-space:pre-wrap">${escapeHtml(line)}</p>` : '<br>',
    )
    .join('')}</div>`
  return {
    to,
    subject: `Factura ${invoice.number} · ${issuer.name}`,
    text,
    html,
    fromName: payload.from_name,
    replyTo: emailPattern.test(issuer.email ?? '') ? (issuer.email ?? undefined) : undefined,
    tags: [{ name: 'category', value: 'invoice' }],
  }
}
