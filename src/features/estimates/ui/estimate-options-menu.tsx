import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@doscientos/ui'
import { Copy, DotsThree, Files, Trash, WhatsappLogo } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'

import { deleteEstimate, duplicateEstimate } from '../application/estimate-actions'

export function EstimateOptionsMenu({
  estimateId,
  draft,
  onCopyLink,
  onSendWhatsapp,
}: {
  estimateId: string
  draft: boolean
  onCopyLink: () => Promise<void>
  onSendWhatsapp: () => Promise<void>
}) {
  const navigate = useNavigate()
  return (
    <DropdownMenuTrigger>
      <IconButton
        variant="outline"
        {...(!draft ? { size: 'icon-lg' } : {})}
        label="Más opciones del presupuesto"
      >
        <DotsThree aria-hidden="true" weight="bold" className="size-4" />
      </IconButton>
      <DropdownMenuContent placement="bottom end">
        <DropdownMenuItem onAction={() => void onSendWhatsapp()}>
          <WhatsappLogo aria-hidden="true" className="size-4" />
          Enviar por WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => void onCopyLink()}>
          <Copy aria-hidden="true" className="size-4" />
          Copiar enlace del cliente
        </DropdownMenuItem>
        <DropdownMenuItem
          onAction={() => {
            const id = duplicateEstimate(estimateId)
            if (id) void navigate({ to: '/presupuestos/$estimateId', params: { estimateId: id } })
          }}
        >
          <Files aria-hidden="true" className="size-4" />
          {draft ? 'Duplicar presupuesto' : 'Crear revisión'}
        </DropdownMenuItem>
        {draft ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onAction={() => {
                deleteEstimate(estimateId)
                void navigate({ to: '/presupuestos' })
              }}
            >
              <Trash aria-hidden="true" className="size-4" />
              Eliminar presupuesto
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenuTrigger>
  )
}
