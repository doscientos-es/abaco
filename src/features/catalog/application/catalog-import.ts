import { parseEuros } from '@/shared/domain/money'
import { normalizeHeader, type ImportSchema } from '@/shared/domain/table-import'
import type { CatalogItem, CatalogKind } from '@/shared/domain/types'

export type CatalogInput = Omit<CatalogItem, 'id' | 'tenantId'>

const kinds: Record<string, CatalogKind> = {
  material: 'material',
  materiales: 'material',
  manodeobra: 'labor',
  labor: 'labor',
  servicio: 'labor',
  servicios: 'labor',
  otros: 'other',
  otro: 'other',
  other: 'other',
}

export const catalogImportSchema: ImportSchema<CatalogInput> = {
  singular: 'artículo',
  plural: 'artículos de catálogo',
  columns: [
    { label: 'Nombre', aliases: ['Artículo', 'Descripción'], required: true, hint: 'Nombre del artículo.', example: 'Alicatado de pared' },
    { label: 'Referencia', aliases: ['SKU', 'Código', 'Codigo'], hint: 'Código interno único.', example: 'MAT-001' },
    { label: 'Tipo', hint: 'Solo: Material, Mano de obra u Otros. Si se deja vacío será Material.', example: 'Mano de obra' },
    { label: 'Categoría', aliases: ['Categoria', 'Familia'], hint: 'Agrupa artículos.', example: 'Reformas' },
    { label: 'Unidad', aliases: ['Ud'], hint: 'ud, m², h, etc. Si se deja vacío será ud.', example: 'm²' },
    { label: 'Precio', aliases: ['Precio unitario', 'PVP'], required: true, hint: 'Número sin símbolo de moneda, con coma decimal.', example: '24,50' },
  ],
  parse(row) {
    const name = row['Nombre'] ?? ''
    if (!name) return { ok: false, error: 'Falta el nombre.' }
    const rawKind = row['Tipo'] ?? ''
    const kind = rawKind ? kinds[normalizeHeader(rawKind)] : 'material'
    if (!kind) return { ok: false, error: `Tipo no válido: ${rawKind}` }
    const rawPrice = (row['Precio'] ?? '').replace(/[€$]/g, '')
    if (!/^-?[\d.,\s]+$/.test(rawPrice)) return { ok: false, error: `Precio no válido: ${row['Precio'] ?? ''}` }
    const unitPriceCents = parseEuros(rawPrice)
    if (unitPriceCents < 0) return { ok: false, error: 'El precio no puede ser negativo.' }
    return {
      ok: true,
      value: {
        name,
        sku: row['Referencia'] ?? '',
        kind,
        category: row['Categoría'] ?? '',
        unit: row['Unidad'] || 'ud',
        unitPriceCents,
      },
    }
  },
  duplicateKeys: (item) => [item.sku ? `sku:${item.sku.toLowerCase()}` : `name:${item.name.toLowerCase()}`],
}

/** Keys of the catalog already stored, in the same form as `duplicateKeys`. */
export function catalogKeys(items: CatalogItem[]): Set<string> {
  return new Set(items.flatMap((item) => catalogImportSchema.duplicateKeys(item)))
}
