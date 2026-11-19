import { useState } from 'react'

import { companyEstimateDesign, namedDocumentOptions } from '@/shared/domain/document-library'
import {
  defaultEstimateDesign,
  sameEstimateDesign,
  type EstimateDesign,
} from '@/shared/domain/estimate-design'
import type { Tenant } from '@/shared/domain/types'
import { SelectField } from '@/shared/ui/form'

export function EstimateTemplateField({
  tenant,
  design = defaultEstimateDesign,
  onChange,
}: {
  tenant: Tenant
  design?: EstimateDesign | undefined
  onChange: (design: EstimateDesign) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const library = tenant.documentLibrary
  if (!library?.estimates.length) return null
  const matching = library.estimates.filter((item) => sameEstimateDesign(item.design, design))
  const companyDesign = companyEstimateDesign(tenant)
  const companyId = library.defaultEstimateId ?? 'company'
  const matchesDefault = sameEstimateDesign(design, companyDesign)
  const selected =
    matching.find(({ id }) => id === selectedId)?.id ??
    (matchesDefault ? companyId : matching.length === 1 ? matching[0]?.id : '')
  return (
    <SelectField
      label="Plantilla del presupuesto"
      value={selected ?? ''}
      placeholder="Diseño personalizado"
      options={[
        ...(library.defaultEstimateId
          ? []
          : [{ value: companyId, label: 'Diseño por defecto de la empresa' }]),
        ...namedDocumentOptions(library.estimates, library.defaultEstimateId),
      ]}
      onChange={(id) => {
        setSelectedId(id)
        onChange(library.estimates.find((item) => item.id === id)?.design ?? companyDesign)
      }}
    />
  )
}
