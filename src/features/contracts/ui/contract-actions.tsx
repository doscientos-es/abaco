import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  toast,
} from '@doscientos/ui'
import { DotsThree, Eye, FilePdf, Signature } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'

import type { ServiceContract } from '../application/contract-actions'
import { signedContractDocumentUrl } from '../application/contract-signature-actions'
import { ContractSignatureDialog } from './contract-signature-dialog'

export function ContractActions({ contract }: { contract: ServiceContract }) {
  const session = useSession()
  const navigate = useNavigate()
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const admin = session?.tenantId === contract.tenant_id && can(session?.role, 'contracts:write')

  async function openDocument() {
    if (!contract.signed_document_path || opening) return
    const tab = window.open('', '_blank')
    if (!tab) {
      toast.error('Permite abrir ventanas para consultar el PDF firmado.')
      return
    }
    tab.opener = null
    setOpening(true)
    try {
      tab.location.replace(await signedContractDocumentUrl(contract.signed_document_path))
    } catch (cause) {
      tab.close()
      toast.error(cause instanceof Error ? cause.message : 'No se pudo abrir el PDF firmado.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <DropdownMenuTrigger>
        <IconButton label={`Acciones de ${contract.title}`} variant="outline" isDisabled={opening}>
          <DotsThree aria-hidden="true" weight="bold" className="size-5" />
        </IconButton>
        <DropdownMenuContent placement="bottom end">
          <DropdownMenuItem
            onAction={() =>
              void navigate({ to: '/contratos/$contractId', params: { contractId: contract.id } })
            }
          >
            <Eye aria-hidden="true" className="size-4" />
            Ver contrato
          </DropdownMenuItem>
          {admin && !contract.signed_document_path ? (
            <DropdownMenuItem onAction={() => setSignatureOpen(true)}>
              <Signature aria-hidden="true" className="size-4" />
              {contract.signed_at ? 'Adjuntar PDF firmado' : 'Marcar como firmado'}
            </DropdownMenuItem>
          ) : null}
          {admin && contract.signed_document_path ? (
            <DropdownMenuItem onAction={() => void openDocument()}>
              <FilePdf aria-hidden="true" className="size-4" />
              Ver PDF firmado
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenuTrigger>
      {signatureOpen ? (
        <ContractSignatureDialog contract={contract} onClose={() => setSignatureOpen(false)} />
      ) : null}
    </>
  )
}
