import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ContractInvoiceNotification = {
  id: string
  invoice_id: string
  invoice_number: string
  concept: string
  delivery_status: 'pending' | 'processing' | 'sent' | 'failed'
  error_code: string | null
  created_at: string
  read_at: string | null
}

export async function listContractInvoiceNotifications(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'list_contract_invoice_notifications',
    { p_tenant_id: tenantId },
  )
  if (error) throw new Error('No se pudieron cargar los avisos de facturación.')
  return (data ?? []) as ContractInvoiceNotification[]
}

export async function readContractInvoiceNotification(id: string): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('read_contract_invoice_notification', {
    p_id: id,
  })
  if (error) throw new Error('No se pudo marcar el aviso como leído.')
}
