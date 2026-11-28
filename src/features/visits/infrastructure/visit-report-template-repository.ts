import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { VisitReportTemplate, VisitReportTemplateKind } from '../domain/visit-report-templates'

function fail(code: string) {
  if (code === 'P0409')
    return new Error(
      'Hay cambios de otra sesión. Actualiza y revisa la versión antes de continuar.',
    )
  if (code === '42501' || code === 'P0402')
    return new Error('No tienes permiso o la empresa está en modo de solo lectura.')
  if (code === 'P0002') return new Error('La visita ya no está disponible.')
  if (code === '22023') return new Error('Revisa los datos de la plantilla.')
  return new Error('No se pudo confirmar el cambio. Comprueba tu conexión e inténtalo de nuevo.')
}

export async function listVisitReportTemplates(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_visit_report_templates', {
    p_tenant_id: tenantId,
  })
  if (error) throw fail(error.code)
  return (data as VisitReportTemplate[] | null) ?? []
}

export async function saveVisitReportTemplateDraft(
  tenantId: string,
  kind: VisitReportTemplateKind,
  revision: number,
  labels: string[],
) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'save_visit_report_template_draft',
    {
      p_tenant_id: tenantId,
      p_service_kind: kind,
      p_expected_revision: revision,
      p_labels: labels,
    },
  )
  if (error) throw fail(error.code)
  return Number(data)
}

export async function publishVisitReportTemplate(
  tenantId: string,
  kind: VisitReportTemplateKind,
  revision: number,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc('publish_visit_report_template', {
    p_tenant_id: tenantId,
    p_service_kind: kind,
    p_expected_revision: revision,
  })
  if (error) throw fail(error.code)
  return Number(data)
}

export async function applyVisitReportTemplate(
  tenantId: string,
  visitId: string,
  kind: VisitReportTemplateKind,
  version: number,
  operationId: string,
) {
  const { error } = await createBrowserSupabaseClient().rpc('apply_visit_report_template', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_service_kind: kind,
    p_published_version: version,
    p_operation_id: operationId,
  })
  if (error) throw fail(error.code)
}
