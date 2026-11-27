import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@doscientos/ui'
import {
  Archive,
  CreditCard,
  DotsThreeVertical,
  IdentificationCard,
  ListChecks,
  Package,
  Pause,
  Play,
  Receipt,
  TrayArrowUp,
} from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'

import type { PlatformCompany, PlatformCompanyAction } from '../application/superadmin-queries'
import {
  activitySearch,
  companySectionSearch,
  directorySearch,
  invoiceSearch,
  type PlatformSearch,
} from '../domain/platform-navigation'

export function CompanyDirectoryMenu({
  company,
  search,
  onAction,
}: {
  company: PlatformCompany
  search: PlatformSearch
  onAction: (action: PlatformCompanyAction) => void
}) {
  const navigate = useNavigate({ from: '/superadmin' })
  const details = { ...directorySearch(search), empresa: company.id }
  const open = (target: PlatformSearch) => void navigate({ search: target })
  const renewalBlocksArchive =
    !company.is_complimentary &&
    ['active', 'past_due'].includes(company.subscription_status) &&
    !company.cancel_at_period_end

  return (
    <DropdownMenuTrigger>
      <Button variant="ghost" className="size-11 p-0" aria-label={`Acciones de ${company.name}`}>
        <DotsThreeVertical aria-hidden="true" weight="bold" className="size-5" />
      </Button>
      <DropdownMenuContent placement="bottom end">
        <DropdownMenuItem
          id="details"
          onAction={() => open(companySectionSearch(details, 'datos'))}
        >
          <IdentificationCard aria-hidden="true" /> Ver ficha
        </DropdownMenuItem>
        <DropdownMenuItem id="subscription" onAction={() => open(details)}>
          <CreditCard aria-hidden="true" /> Suscripción y precio
        </DropdownMenuItem>
        <DropdownMenuItem
          id="modules"
          onAction={() => open(companySectionSearch(details, 'modulos'))}
        >
          <Package aria-hidden="true" /> Gestionar módulos
        </DropdownMenuItem>
        <DropdownMenuItem
          id="invoices"
          onAction={() => open(invoiceSearch('', undefined, 1, company.id))}
        >
          <Receipt aria-hidden="true" /> Ver facturas
        </DropdownMenuItem>
        <DropdownMenuItem id="activity" onAction={() => open(activitySearch(company.id))}>
          <ListChecks aria-hidden="true" /> Ver actividad
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {company.pausable ? (
          <DropdownMenuItem
            id="pause"
            isDisabled={Boolean(company.has_pending_payment)}
            onAction={() => onAction('pause')}
          >
            <Pause aria-hidden="true" /> Pausar renovación
          </DropdownMenuItem>
        ) : null}
        {company.resumable ? (
          <DropdownMenuItem
            id="resume"
            isDisabled={Boolean(company.has_pending_payment)}
            onAction={() => onAction('resume')}
          >
            <Play aria-hidden="true" /> Reanudar renovación
          </DropdownMenuItem>
        ) : null}
        {company.archived_at ? (
          <DropdownMenuItem id="restore" onAction={() => onAction('restore')}>
            <TrayArrowUp aria-hidden="true" /> Restaurar empresa
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            id="archive"
            variant="destructive"
            isDisabled={Boolean(company.has_pending_payment || renewalBlocksArchive)}
            onAction={() => onAction('archive')}
            textValue="Archivar empresa"
          >
            <Archive aria-hidden="true" />
            {company.has_pending_payment
              ? 'Archivar (pago en curso)'
              : renewalBlocksArchive
                ? 'Archivar (pausa primero)'
                : 'Archivar empresa'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenuTrigger>
  )
}
