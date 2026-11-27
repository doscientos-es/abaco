import { applyRate } from '@/shared/domain/money'

// The database stores the base before modules and VAT. An exact gross target
// is possible only if its rounded VAT and the active surcharges reconcile.
export function baseForGrossCharge(
  grossCents: number,
  moduleCents: number,
  vatPercent: number,
): number | null {
  const net = Math.round((grossCents * 100) / (100 + vatPercent))
  const base = net - moduleCents
  return base >= 1 && base <= 10_000_000 && net + applyRate(net, vatPercent) === grossCents
    ? base
    : null
}
