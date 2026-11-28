import { queryOptions } from '@tanstack/react-query'

import { listVisitReportTemplates } from '../infrastructure/visit-report-template-repository'

export {
  applyVisitReportTemplate,
  publishVisitReportTemplate,
  saveVisitReportTemplateDraft,
} from '../infrastructure/visit-report-template-repository'

export function visitReportTemplatesQuery(tenantId: string, userId: string) {
  return queryOptions({
    queryKey: ['visit-report-templates', tenantId, userId],
    queryFn: () => listVisitReportTemplates(tenantId),
    refetchOnMount: 'always',
    gcTime: 0,
  })
}
