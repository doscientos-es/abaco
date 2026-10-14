import { parseEuros } from '@/shared/domain/money'
import { formLimits } from '@/shared/domain/form-limits'
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
    if (!name.trim()) return { ok: false, error: 'Falta el nombre.' }
    if (name.length > formLimits.catalogName) return { ok: false, error: `El nombre supera ${formLimits.catalogName} caracteres.` }
    const sku = row['Referencia'] ?? ''
    if (sku.length > formLimits.sku) return { ok: false, error: `La referencia supera ${formLimits.sku} caracteres.` }
    const category = row['Categoría'] ?? ''
    if (category.length > formLimits.category) return { ok: false, error: `La categoría supera ${formLimits.category} caracteres.` }
    const unit = row['Unidad'] || 'ud'
    if (unit.length > formLimits.unit) return { ok: false, error: `La unidad supera ${formLimits.unit} caracteres.` }
    const rawKind = row['Tipo'] ?? ''
    const kind = rawKind ? kinds[normalizeHeader(rawKind)] : 'material'
    if (!kind) return { ok: false, error: `Tipo no válido: ${rawKind}` }
    const rawPrice = (row['Precio'] ?? '').replace(/[€$]/g, '')
    if (!/^-?[\d.,\s]+$/.test(rawPrice)) return { ok: false, error: `Precio no válido: ${row['Precio'] ?? ''}` }
    const unitPriceCents = parseEuros(rawPrice)
    if (unitPriceCents < 0) return { ok: false, error: 'El precio no puede ser negativo.' }
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents > formLimits.monetaryAmount * 100) {
      return { ok: false, error: `El precio supera ${formLimits.monetaryAmount.toLocaleString('es-ES')} €.` }
    }
    return {
      ok: true,
      value: {
        name: name.trim(),
        sku,
        kind,
        category,
        unit,
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
