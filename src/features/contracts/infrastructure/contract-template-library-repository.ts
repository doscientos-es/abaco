import { z } from 'zod'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  librarySectionSchema,
  libraryTemplateSchema,
  type LibrarySection,
  type LibraryTemplate,
} from '../domain/contract-document-template'

export async function loadContractTemplateLibrary(tenantId: string) {
  const db = createBrowserSupabaseClient()
  const [sections, templates] = await Promise.all([
    db
      .from('contract_template_sections')
      .select('id,title,content,page_break_before,format,revision')
      .eq('tenant_id', tenantId)
      .order('title'),
    db
      .from('contract_template_library')
      .select('id,name,before_ids,after_ids,revision')
      .eq('tenant_id', tenantId)
      .order('name'),
  ])
  if (sections.error || templates.error)
    throw new Error(sections.error?.message ?? templates.error?.message)
  return {
    sections: z.array(librarySectionSchema).parse(sections.data ?? []),
    templates: z.array(libraryTemplateSchema).parse(templates.data ?? []),
  }
}

export async function saveLibrarySection(
  tenantId: string,
  section: Omit<LibrarySection, 'revision'> & { revision: number },
) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'save_contract_template_section',
    {
      p_tenant_id: tenantId,
      p_id: section.id,
      p_expected_revision: section.revision,
      p_title: section.title,
      p_content: section.content,
      p_page_break_before: section.page_break_before,
      p_format: section.format,
    },
  )
  if (error || typeof data !== 'number')
    throw new Error(error?.message ?? 'No se pudo guardar la sección.')
  return data
}

export async function saveLibraryTemplate(
  tenantId: string,
  template: Omit<LibraryTemplate, 'revision'> & { revision: number },
) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'save_contract_library_template',
    {
      p_tenant_id: tenantId,
      p_id: template.id,
      p_expected_revision: template.revision,
      p_name: template.name,
      p_before_ids: template.before_ids,
      p_after_ids: template.after_ids,
    },
  )
  if (error || typeof data !== 'number')
    throw new Error(error?.message ?? 'No se pudo guardar la plantilla.')
  return data
}

export async function applyLibraryTemplate(input: {
  tenantId: string
  contractId: string
  templateId: string
  templateRevision: number
  expectedUpdatedAt: string
  operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('apply_contract_library_template', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_template_id: input.templateId,
    p_template_revision: input.templateRevision,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
