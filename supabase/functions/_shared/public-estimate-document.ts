/** Only agreed document fields leave the server; response state stays live. */
export function publicEstimateDocument(
  published: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  return {
    id: published.id,
    tenant_id: published.tenant_id,
    number: published.number,
    client_id: published.client_id,
    title: published.title,
    status: current.status,
    document_format: published.document_format ?? 'table',
    document_design: published.document_design ?? null,
    document_sections: published.document_sections ?? [],
    conversion_destination: published.conversion_destination,
    contract_billing_frequency: published.contract_billing_frequency,
    vat_rate: published.vat_rate,
    discount_type: published.discount_type,
    discount_value: published.discount_value,
    clauses: published.clauses,
    valid_until: published.valid_until,
    created_at: published.created_at,
    responded_at: current.responded_at,
    responded_by: current.responded_by,
    estimate_lines: published.estimate_lines,
    estimate_milestones: published.estimate_milestones,
  }
}
