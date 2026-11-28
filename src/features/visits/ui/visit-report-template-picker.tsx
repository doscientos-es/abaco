import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'
import { SelectField } from '@/shared/ui/form'

import {
  applyVisitReportTemplate,
  visitReportTemplatesQuery,
} from '../application/visit-report-template-actions'
import { visitReportTemplatePresets } from '../domain/visit-report-templates'

export function VisitReportTemplatePicker({
  tenantId,
  userId,
  visitId,
  onApplied,
  onRefresh,
}: {
  tenantId: string
  userId: string
  visitId: string
  onApplied: () => void
  onRefresh: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const regionId = useId()
  const headingId = useId()
  const operation = useRef<{ selection: string; id: string } | null>(null)
  const lock = useActionLock()
  const templates = useQuery({ ...visitReportTemplatesQuery(tenantId, userId), enabled: open })
  const published = (templates.data ?? []).filter((item) => item.published_version !== null)
  const selected = published.find((item) => item.service_kind === kind)

  async function apply() {
    if (!templates.isSuccess || !selected || selected.published_version === null || !lock.acquire())
      return
    const selection = `${selected.service_kind}:${selected.published_version}`
    if (operation.current?.selection !== selection)
      operation.current = { selection, id: crypto.randomUUID() }
    setPending(true)
    setError('')
    try {
      await applyVisitReportTemplate(
        tenantId,
        visitId,
        selected.service_kind,
        selected.published_version,
        operation.current.id,
      )
      onApplied()
      await onRefresh()
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar la plantilla.')
      await templates.refetch()
      await onRefresh()
    } finally {
      setPending(false)
      lock.release()
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <Button
        className="min-h-11 max-sm:w-full"
        variant="outline"
        aria-expanded={open}
        {...(open ? { 'aria-controls': regionId } : {})}
        isDisabled={pending}
        onPress={() => setOpen((previous) => !previous)}
      >
        {open ? 'Cerrar plantillas' : 'Usar una plantilla de parte'}
      </Button>
      {open ? (
        <section
          id={regionId}
          aria-labelledby={headingId}
          className="border-border min-w-0 space-y-3 rounded-lg border p-3"
        >
          <h5 id={headingId} className="text-sm font-semibold">
            Copiar plantilla publicada
          </h5>
          <p className="text-muted-foreground text-sm">
            Solo se copian las comprobaciones a esta visita. No se modifican otros partes ni se
            copian notas.
          </p>
          {templates.isPending ? <output>Cargando plantillas…</output> : null}
          {templates.isError ? (
            <div className="space-y-2">
              <p role="alert" className="text-destructive text-sm">
                No se pudieron cargar las plantillas.
              </p>
              <Button
                className="min-h-11"
                variant="outline"
                onPress={() => void templates.refetch()}
              >
                Reintentar carga de plantillas
              </Button>
            </div>
          ) : null}
          {templates.isSuccess && published.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aún no hay plantillas publicadas.{' '}
              <Link
                to="/personalizar"
                search={{ tab: 'documentos' }}
                className="text-primary underline"
              >
                Gestionar plantillas
              </Link>
            </p>
          ) : null}
          {templates.isSuccess && published.length ? (
            <SelectField
              label="Servicio de la plantilla"
              value={kind}
              onChange={(next) => {
                setKind(next)
                setError('')
              }}
              isDisabled={pending}
              options={visitReportTemplatePresets
                .filter((preset) => published.some((entry) => entry.service_kind === preset.kind))
                .map((preset) => ({ value: preset.kind, label: preset.title }))}
              placeholder="Elige un servicio"
            />
          ) : null}
          {selected ? (
            <div className="bg-muted/40 min-w-0 rounded-md p-3">
              <p className="mb-1 text-sm font-medium">Comprobaciones que se copiarán</p>
              <ul className="list-disc space-y-1 pl-4 text-sm wrap-anywhere">
                {selected.published_labels?.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {templates.isSuccess && published.length ? (
            <Button
              className="min-h-11 max-sm:w-full"
              isDisabled={!selected || pending}
              onPress={() => void apply()}
            >
              {pending ? 'Copiando…' : 'Copiar a esta visita'}
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
