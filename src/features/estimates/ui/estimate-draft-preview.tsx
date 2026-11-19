import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'

import { companyEstimateDesign } from '@/shared/domain/document-library'
import { defaultEstimateDesign, sameEstimateDesign } from '@/shared/domain/estimate-design'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'
import { EstimateDesignFields } from '@/shared/ui/estimate-design-fields'

import { EstimateAutoSaveStatus } from './estimate-auto-save-status'
import { EstimateDesignWorkspace } from './estimate-design-workspace'
import { useEstimateDraft, usePatchEstimate } from './estimate-draft-context'
import { EstimateTemplateField } from './estimate-template-field'
import { useEstimatePrint } from './use-estimate-print'

export function EstimateDraftPreview({
  estimate,
  client,
  tenant,
  canEdit,
  onBack,
}: {
  estimate: Estimate
  client: Client | undefined
  tenant: Tenant
  canEdit: boolean
  onBack: () => void
}) {
  const { documentRef, print } = useEstimatePrint()
  const creation = useEstimateDraft()
  const patchEstimate = usePatchEstimate()
  const design = estimate.documentDesign ?? defaultEstimateDesign
  const companyDesign = companyEstimateDesign(tenant)
  const changeDesign = (documentDesign: typeof design) =>
    patchEstimate(estimate.id, { documentDesign })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" onPress={onBack}>
          Volver a editar
        </Button>
        <Button onPress={print}>Imprimir o guardar PDF</Button>
      </div>
      <EstimateDesignWorkspace
        estimate={estimate}
        client={client}
        tenant={tenant}
        documentRef={documentRef}
        controls={
          canEdit && !creation?.submitted ? (
            <Card>
              <CardHeader>
                <CardTitle>Diseño del presupuesto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-xs">
                  Los cambios solo afectan a este presupuesto. Al publicarlo, se conserva este
                  diseño.
                </p>
                <EstimateTemplateField tenant={tenant} design={design} onChange={changeDesign} />
                <EstimateDesignFields
                  value={design}
                  brandColor={tenant.brandColor}
                  onChange={changeDesign}
                />
                {!sameEstimateDesign(design, companyDesign) ? (
                  <Button variant="outline" size="sm" onPress={() => changeDesign(companyDesign)}>
                    Usar diseño de la empresa
                  </Button>
                ) : null}
                {!creation ? <EstimateAutoSaveStatus /> : null}
              </CardContent>
            </Card>
          ) : null
        }
      />
    </div>
  )
}
