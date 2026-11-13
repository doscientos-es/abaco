import { Button, IconButton, Popover } from '@doscientos/ui'
import { Receipt } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listContractInvoiceNotifications,
  readContractInvoiceNotification,
  type ContractInvoiceNotification,
} from '../application/contract-invoice-notifications'

function deliveryLabel(notice: ContractInvoiceNotification) {
  if (notice.delivery_status === 'sent') return 'Enviada por email al cliente.'
  if (notice.delivery_status !== 'failed') return 'Envío al cliente pendiente.'
  return notice.error_code === 'email_missing'
    ? 'No se pudo enviar: el cliente no tiene un email válido.'
    : 'No se pudo enviar el email. Revisa la factura y envíala manualmente.'
}

export function ContractInvoiceNotifications({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = ['contract-invoice-notifications', tenantId, userId]
  const notices = useQuery({
    queryKey,
    queryFn: () => listContractInvoiceNotifications(tenantId),
    refetchInterval: 60_000,
  })
  const read = useMutation({
    mutationFn: readContractInvoiceNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const unread = notices.data?.filter((notice) => !notice.read_at).length ?? 0

  return (
    <Popover
      placement="top end"
      className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
      trigger={
        <IconButton
          label={
            unread > 0 ? `Facturas automáticas: ${unread} avisos sin leer` : 'Facturas automáticas'
          }
          variant="ghost"
          className="text-muted-foreground relative"
        >
          <Receipt aria-hidden="true" className="size-4" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="bg-destructive absolute top-1 right-1 size-2 rounded-full"
            />
          ) : null}
        </IconButton>
      }
    >
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Facturas automáticas</h2>
        {notices.isPending ? (
          <p className="text-sm">Cargando avisos…</p>
        ) : notices.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar los avisos de facturación.
          </p>
        ) : !notices.data?.length ? (
          <p className="text-muted-foreground text-sm">No hay facturas automáticas recientes.</p>
        ) : (
          <ul className="space-y-3">
            {notices.data.map((notice) => (
              <li key={notice.id} className="border-border space-y-1 border-b pb-3 text-sm">
                {/* Reload the store as well as the route: these invoices originate on the server. */}
                <a
                  href={`/facturas/${encodeURIComponent(notice.invoice_id)}`}
                  className="text-primary font-medium hover:underline"
                >
                  Factura {notice.invoice_number} generada
                </a>
                <p>{notice.concept}</p>
                <p
                  className={
                    notice.delivery_status === 'failed'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }
                >
                  {deliveryLabel(notice)}
                </p>
                {!notice.read_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={read.isPending}
                    onPress={() => read.mutate(notice.id)}
                  >
                    Marcar como leído
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {read.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudo marcar el aviso como leído.
          </p>
        ) : null}
      </div>
    </Popover>
  )
}
