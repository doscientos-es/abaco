import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Client } from '@/shared/domain/types'

import type { ServiceContract } from '../application/contract-actions'
import { ContractQuickActions, contractEmailLink } from './contract-quick-actions'

const contract = { title: 'Limpieza & oficinas', signed_at: null } as ServiceContract
const client = { name: 'Cliente', email: 'cliente@example.org' } as Client

function buttons(node: ReactNode): Array<() => void> {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return []
    return [
      ...(child.type === 'button' && child.props.onClick ? [child.props.onClick] : []),
      ...buttons(child.props.children),
    ]
  })
}

describe('contract quick actions', () => {
  it('prepares an encoded email without claiming an attachment', () => {
    const link = contractEmailLink(contract, client)
    expect(link).toContain('mailto:cliente%40example.org?')
    expect(decodeURIComponent(link ?? '')).toContain('Contrato · Limpieza & oficinas')
    expect(contractEmailLink(contract, { ...client, email: 'incorrecto' })).toBeNull()
    expect(contractEmailLink(contract, undefined)).toBeNull()
    const html = renderToStaticMarkup(
      <ContractQuickActions
        contract={contract}
        client={client}
        onPrint={() => {}}
        onViewDocument={() => {}}
      />,
    )
    expect(html).toContain('Adjunta el PDF manualmente')
  })

  it('connects PDF and preview to their real actions and distinguishes signed documents', () => {
    const print = vi.fn()
    const view = vi.fn()
    const props = {
      contract: { ...contract, signed_at: '2026-01-01', signed_document_path: 'signed.pdf' },
      client,
      onPrint: print,
      onViewDocument: view,
    }
    const node = ContractQuickActions(props)
    buttons(node).forEach((press) => press())
    expect(print).toHaveBeenCalledOnce()
    expect(view).toHaveBeenCalledOnce()
    expect(renderToStaticMarkup(node)).toContain('El PDF generado no incluye la firma')
    expect(renderToStaticMarkup(<ContractQuickActions {...props} client={undefined} />)).toContain(
      'Añade un email',
    )
  })
})
