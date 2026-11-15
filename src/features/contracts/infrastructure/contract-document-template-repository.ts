import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  contractDocumentSectionsSchema,
  emptyContractDocumentSections,
  type ContractDocumentSections,
  type ContractDocumentTemplate,
} from '../domain/contract-document-template'

export async function loadContractDocumentTemplate(
  tenantId: string,
): Promise<ContractDocumentTemplate> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('contract_document_templates')
    .select('sections,revision')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { sections: emptyContractDocumentSections(), revision: 0 }
  return {
    sections: contractDocumentSectionsSchema.parse(data.sections),
    revision: data.revision as number,
  }
}

export async function saveContractDocumentTemplate(
  tenantId: string,
  template: ContractDocumentTemplate,
) {
  const sections: ContractDocumentSections = contractDocumentSectionsSchema.parse(template.sections)
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'save_contract_document_template',
    {
      p_tenant_id: tenantId,
      p_expected_revision: template.revision,
      p_sections: sections,
    },
  )
  if (error) throw new Error(error.message)
  if (typeof data !== 'number') throw new Error('No se pudo confirmar el guardado de la plantilla.')
  return data
}

export async function applyContractDocumentTemplate(input: {
  tenantId: string
  contractId: string
  expectedUpdatedAt: string
  operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('apply_contract_document_template', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
