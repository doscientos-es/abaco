import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { EstimateFormat } from '@/shared/domain/estimate-document'
import type { Estimate } from '@/shared/domain/types'
import {
  getSaveStatus,
  newId,
  retryStoreSaves,
  useSaveStatus,
  useTenantData,
} from '@/shared/store/store'

import { submitEstimateDraft } from '../application/estimate-actions'
import { buildEstimateDraft } from '../domain/new-estimate'
import { EstimateDraftProvider } from './estimate-draft-context'
import { EstimateEditorPage } from './estimate-editor-page'

export function EstimateCreatePage({
  clientId = '',
  title = '',
  format = 'table',
}: {
  clientId?: string
  title?: string
  format?: EstimateFormat
}) {
  const { tenant } = useTenantData()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() =>
    buildEstimateDraft(tenant, clientId, title, format, newId),
  )
  const draftRef = useRef(draft)
  const submitted = useRef(false)
  const saved = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = useSaveStatus()
  const busy = pending && status.state !== 'error'

  useBlocker({
    shouldBlockFn: () =>
      !saved.current &&
      !window.confirm('Este presupuesto todavía no está guardado. ¿Quieres descartarlo?'),
    enableBeforeUnload: () => !saved.current,
  })

  useEffect(() => {
    if (!pending || status.state !== 'saved') return
    saved.current = true
    void navigate({
      to: '/presupuestos/$estimateId',
      params: { estimateId: draft.id },
      replace: true,
    })
  }, [pending, status.state, draft.id, navigate])

  function patch(id: string, changes: Partial<Estimate>) {
    if (submitted.current || id !== draftRef.current.id) return
    draftRef.current = { ...draftRef.current, ...changes }
    setDraft(draftRef.current)
    setError(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    if (busy) return
    // Keyboard submission must also commit inputs that normally commit on blur.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (!event.currentTarget.reportValidity()) return
    setError(null)
    try {
      if (submitted.current) {
        retryStoreSaves()
      } else {
        if (getSaveStatus().state === 'error')
          throw new Error(
            'Hay cambios pendientes de guardar. Reintenta la sincronización antes de crear el presupuesto.',
          )
        submitEstimateDraft(draftRef.current)
        submitted.current = true
      }
      setPending(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el presupuesto.')
    }
  }

  return (
    <EstimateDraftProvider
      value={{
        estimate: draft,
        patch,
        busy,
        submitted: submitted.current,
        error:
          error ??
          (pending && status.state === 'error'
            ? (status.message ?? 'No se pudo guardar. Reintenta la creación.')
            : null),
      }}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="min-w-0">
          <EstimateEditorPage estimateId={draft.id} />
        </fieldset>
      </form>
    </EstimateDraftProvider>
  )
}
