/** Published agreements are authoritative; older snapshots predate the agreement field. */
export function estimateEmailTotal(snapshot: Record<string, unknown>): number | null {
  const estimate = snapshot.estimate as Record<string, unknown> | undefined
  const lines = estimate?.estimate_lines
  if (!estimate || !Array.isArray(lines)) return null

  if (snapshot.agreement !== undefined && snapshot.agreement !== null) {
    const agreement = snapshot.agreement as { version?: unknown; price?: { totalCents?: unknown } }
    const total = agreement?.price?.totalCents
    return agreement?.version === 1 &&
      typeof total === 'number' &&
      Number.isSafeInteger(total) &&
      total >= 0
      ? total
      : null
  }

  const net = lines.reduce((sum, line: Record<string, unknown>) => {
    const gross = Math.round(Number(line.quantity) * Number(line.unit_price_cents))
    const discount = Math.min(100, Math.max(0, Number(line.discount_percent) || 0))
    return sum + gross - Math.round((gross * discount) / 100)
  }, 0)
  const discountValue = Number(estimate.discount_value) || 0
  const discount =
    estimate.discount_type === 'percent'
      ? Math.round((net * Math.min(100, Math.max(0, discountValue))) / 100)
      : estimate.discount_type === 'amount'
        ? Math.min(net, Math.max(0, Math.round(discountValue)))
        : 0
  const subtotal = net - discount
  const total = subtotal + Math.round((subtotal * Number(estimate.vat_rate)) / 100)
  return Number.isSafeInteger(total) && total >= 0 ? total : null
}
