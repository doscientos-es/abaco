import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitMeasurementParameter = {
  id: string
  label: string
  unit: string
  version: string
  method?: string
}

type ComparableReading = { value: number; unit: string; measured_at: string }
export type VisitMeasurement = ComparableReading & {
  id: string
  label: string
  method: string
  previous: ComparableReading | null
}

type MeasurementContext = {
  supported: boolean
  mode?: 'generic'
  asset_name?: string
  can_record?: boolean
  can_configure?: boolean
  parameters: VisitMeasurementParameter[]
  readings: VisitMeasurement[]
}

export type MeasurementAttempt = {
  parameter: VisitMeasurementParameter
  value: number
  method: string
  measuredAt: string
  operationId: string
}

function asError(error: { code: string; message: string }) {
  if (error.code === 'P0409' || error.code === '22023') return new Error(error.message)
  if (error.code === '42501') return new Error('Ya no tienes permiso para estas mediciones.')
  if (error.code === 'P0402') return new Error('La empresa no puede registrar mediciones.')
  return new Error('No se pudo confirmar la operación. Vuelve a intentarlo.')
}

export async function readVisitMeasurementContext(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('visit_measurement_context', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
  })
  if (error) throw asError(error)
  return data as MeasurementContext
}

export async function recordVisitMeasurement(
  tenantId: string,
  visitId: string,
  attempt: MeasurementAttempt,
) {
  const { parameter, value, method, measuredAt, operationId } = attempt
  const { error } = await createBrowserSupabaseClient().rpc('record_visit_measurement_with_unit', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_parameter_id: parameter.id,
    p_expected_unit: parameter.unit,
    p_parameter_version: parameter.version,
    p_value: value,
    p_method: method,
    p_measured_at: measuredAt,
    p_operation_id: operationId,
  })
  if (error) throw asError(error)
}

export async function configureGenericVisitMeasurement(
  tenantId: string,
  visitId: string,
  input: { id: string; label: string; unit: string; method: string },
) {
  const { error } = await createBrowserSupabaseClient().rpc('configure_generic_visit_measurement', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_id: input.id,
    p_label: input.label,
    p_unit: input.unit,
    p_method: input.method,
  })
  if (error) throw asError(error)
}
