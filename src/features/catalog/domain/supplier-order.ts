export type SupplierOrderLine = {
  name: string
  sku: string
  unit: string
  missingQuantity: number
}

export function isSupplierEmail(email: string): boolean {
  return /^[^\s@?,;&\r\n]+@[^\s@?,;&\r\n]+\.[^\s@?,;&\r\n]+$/.test(email.trim())
}

/** Opens a draft in the user's email client; no order is sent by Ábaco. */
export function supplierOrderMailto(input: {
  email: string
  supplierName: string
  companyName: string
  estimateNumber: string
  lines: SupplierOrderLine[]
}): string | null {
  const email = input.email.trim()
  if (!isSupplierEmail(email) || !input.lines.length) return null
  const lines = input.lines.map((line) => {
    const quantity = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(
      line.missingQuantity,
    )
    return `- ${line.name}${line.sku ? ` (ref. ${line.sku})` : ''}: ${quantity} ${line.unit}`
  })
  const subject = `Solicitud de material · ${input.estimateNumber}`
  const body = [
    `Hola ${input.supplierName},`,
    '',
    `Necesitamos el siguiente material para el presupuesto ${input.estimateNumber}:`,
    ...lines,
    '',
    'Por favor, confírmanos disponibilidad, precio y plazo de entrega.',
    '',
    input.companyName,
  ].join('\n')
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
