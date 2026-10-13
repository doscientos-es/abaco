import { defaultMilestones } from '../domain/estimate'
import type { CatalogItem, TenantData } from '../domain/types'

function catalog(tenantId: string): CatalogItem[] {
  const item = (
    sku: string,
    name: string,
    kind: CatalogItem['kind'],
    category: string,
    unit: string,
    unitPriceCents: number,
  ): CatalogItem => ({ id: `${tenantId}-${sku}`, tenantId, sku, name, kind, category, unit, unitPriceCents })
  return [
    item('MAT-001', 'Azulejo porcelánico 60x60', 'material', 'Revestimientos', 'm²', 2450),
    item('MAT-002', 'Cemento cola flexible 25 kg', 'material', 'Revestimientos', 'saco', 890),
    item('MAT-003', 'Plato de ducha resina 120x80', 'material', 'Fontanería', 'ud', 21500),
    item('MAT-004', 'Pintura plástica blanca 15 L', 'material', 'Pintura', 'bote', 4900),
    item('MO-001', 'Oficial de 1ª albañil', 'labor', 'Mano de obra', 'h', 2800),
    item('MO-002', 'Fontanero', 'labor', 'Mano de obra', 'h', 3000),
    item('MO-003', 'Pintor', 'labor', 'Mano de obra', 'h', 2400),
    item('OTR-001', 'Retirada de escombros', 'other', 'Servicios', 'viaje', 9000),
  ]
}

export function seedTenant(id: string, name: string, taxId: string): TenantData {
  const today = new Date().toISOString().slice(0, 10)
  const clientId = `${id}-c1`
  return {
    tenant: {
      id,
      name,
      taxId,
      email: 'hola@reformas.example',
      phone: '600 000 000',
      defaultVatRate: 10,
      defaultDepositPercent: 40,
      nextEstimateNumber: 2,
    },
    clients: [
      {
        id: clientId,
        tenantId: id,
        name: 'Marta Soler',
        taxId: '12345678Z',
        email: 'marta@example.com',
        phone: '611 222 333',
        address: 'C/ Mayor 12, 2º, Barcelona',
        notes: 'Prefiere WhatsApp.',
      },
    ],
    catalog: catalog(id),
    estimates: [
      {
        id: `${id}-e1`,
        tenantId: id,
        number: 'P-2026-001',
        clientId,
        title: 'Reforma de baño completo',
        status: 'sent',
        vatRate: 10,
        milestones: defaultMilestones(40),
        clauses:
          'Validez de 30 días. Los cambios sobre lo presupuestado se facturan aparte. Plazo estimado: 3 semanas desde la señal.',
        validUntil: today,
        createdAt: today,
        lines: [
          { id: 'l1', catalogItemId: `${id}-MAT-001`, description: 'Azulejo porcelánico 60x60', kind: 'material', unit: 'm²', quantity: 18, unitPriceCents: 2450 },
          { id: 'l2', catalogItemId: `${id}-MAT-003`, description: 'Plato de ducha resina 120x80', kind: 'material', unit: 'ud', quantity: 1, unitPriceCents: 21500 },
          { id: 'l3', catalogItemId: `${id}-MO-001`, description: 'Oficial de 1ª albañil', kind: 'labor', unit: 'h', quantity: 60, unitPriceCents: 2800 },
        ],
      },
    ],
    ledger: [],
    invoices: [],
  }
}
