import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { TextField } from '@/shared/ui/form'

import {
  saveLibraryTemplate,
  type LibrarySection,
  type LibraryTemplate,
} from '../application/contract-template-library-actions'
import { snapshotLibraryTemplate } from '../domain/contract-document-template'
import { ContractTemplateContent } from './contract-template-content'

type TemplateDraft = Omit<LibraryTemplate, 'revision'> & { revision: number }
type Position = 'before_ids' | 'after_ids'

export function ContractLibraryTemplateEditor({
  tenantId,
  initial,
  sections,
  changed,
  saved,
  saving,
}: {
  tenantId: string
  initial: TemplateDraft
  sections: LibrarySection[]
  changed: () => void
  saved: () => void
  saving: (busy: boolean) => void
}) {
  const [template, setTemplate] = useState(initial)
  const [busy, setBusy] = useState(false)
  const cache = useQueryClient()
  const selected = [...template.before_ids, ...template.after_ids]
  const missing = selected.some((id) => !sections.some((section) => section.id === id))
  const preview = missing
    ? null
    : snapshotLibraryTemplate({ ...template, revision: Math.max(1, template.revision) }, sections)
  function update(patch: Partial<TemplateDraft>) {
    setTemplate((current) => ({ ...current, ...patch }))
    changed()
  }
  function add(id: string, position: Position) {
    if (selected.includes(id) || template[position].length >= 20) return
    update({ [position]: [...template[position], id] })
  }
  function remove(id: string, position: Position) {
    update({ [position]: template[position].filter((value) => value !== id) })
  }
  function move(index: number, direction: number, position: Position) {
    const ids = [...template[position]]
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const current = ids[index]
    const other = ids[target]
    if (!current || !other) return
    ids[index] = other
    ids[target] = current
    update({ [position]: ids })
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !template.name.trim() || missing) return
    setBusy(true)
    saving(true)
    try {
      const revision = await saveLibraryTemplate(tenantId, {
        ...template,
        name: template.name.trim(),
      })
      setTemplate((current) => ({ ...current, name: current.name.trim(), revision }))
      await cache.invalidateQueries({ queryKey: ['contract-template-library', tenantId] })
      saved()
      toast.success('Plantilla guardada')
    } catch (error) {
      toast.error('No se pudo guardar la plantilla', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
      saving(false)
    }
  }
  function list(position: Position, title: string) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {template[position].length === 0 ? (
          <p className="text-muted-foreground text-xs">Sin secciones.</p>
        ) : null}
        {template[position].map((id, index) => {
          const title =
            sections.find((section) => section.id === id)?.title || 'Sección no disponible'
          return (
            <div key={id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <button
                type="button"
                disabled={busy || index === 0}
                aria-label={`Subir ${title}`}
                onClick={() => move(index, -1, position)}
                className="rounded px-1 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === template[position].length - 1}
                aria-label={`Bajar ${title}`}
                onClick={() => move(index, 1, position)}
                className="rounded px-1 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Quitar ${title}`}
                onClick={() => remove(id, position)}
                className="text-muted-foreground rounded px-1"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <form className="space-y-5" onSubmit={(event) => void save(event)}>
        <div>
          <h2 className="text-lg font-semibold">Componer plantilla</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Selecciona secciones y ordénalas alrededor del presupuesto anexo.
          </p>
        </div>
        <fieldset disabled={busy}>
          <TextField
            label="Nombre de la plantilla"
            value={template.name}
            onChange={(name) => update({ name })}
            placeholder="Ej. Contrato de mantenimiento"
            maxLength={200}
            required
          />
        </fieldset>
        {list('before_ids', 'Antes del presupuesto')}
        {list('after_ids', 'Después del presupuesto')}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Biblioteca de secciones</h3>
          {sections.length ? (
            sections.map((section) => (
              <div
                key={section.id}
                className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg p-3"
              >
                <span className="min-w-0 flex-1 text-sm">{section.title || 'Sin título'}</span>
                <button
                  type="button"
                  disabled={
                    busy || selected.includes(section.id) || template.before_ids.length >= 20
                  }
                  onClick={() => add(section.id, 'before_ids')}
                  className="text-primary text-xs font-medium disabled:opacity-40"
                >
                  + Antes
                </button>
                <button
                  type="button"
                  disabled={
                    busy || selected.includes(section.id) || template.after_ids.length >= 20
                  }
                  onClick={() => add(section.id, 'after_ids')}
                  className="text-primary text-xs font-medium disabled:opacity-40"
                >
                  + Después
                </button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Crea una sección para empezar a componer.
            </p>
          )}
        </div>
        {missing ? (
          <p role="alert" className="text-destructive text-sm">
            Faltan secciones. Recarga o quítalas de la plantilla.
          </p>
        ) : null}
        <Button type="submit" isDisabled={busy || missing || !template.name.trim()}>
          {busy ? 'Guardando…' : 'Guardar plantilla'}
        </Button>
      </form>
      <aside
        className="rounded-xl border bg-white p-6 text-sm text-black shadow-sm"
        aria-label="Vista previa de la plantilla"
      >
        <p className="mb-5 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Vista previa · {template.name || 'Sin nombre'}
        </p>
        <h3 className="text-lg font-semibold">Contrato de prestación de servicios</h3>
        <p className="mt-1 text-neutral-500">Datos y condiciones particulares del contrato</p>
        <div className="mt-6 space-y-5">
          {preview?.before.map((section) => (
            <ContractTemplateContent key={section.id} section={section} />
          ))}
          <div className="rounded-lg border border-dashed p-4 text-neutral-500">
            Presupuesto aceptado · anexo del contrato
          </div>
          {preview?.after.map((section) => (
            <ContractTemplateContent key={section.id} section={section} />
          ))}
          <div className="grid grid-cols-2 gap-6 pt-6 text-xs text-neutral-500">
            <span className="border-t pt-2">Firma del prestador</span>
            <span className="border-t pt-2">Firma del cliente</span>
          </div>
        </div>
      </aside>
    </div>
  )
}
