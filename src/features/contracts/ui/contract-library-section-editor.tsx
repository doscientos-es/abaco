import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { TextareaField, TextField } from '@/shared/ui/form'

import {
  saveLibrarySection,
  type LibrarySection,
} from '../application/contract-template-library-actions'
import { ContractTemplateContent } from './contract-template-content'

export type SectionDraft = Omit<LibrarySection, 'revision'> & { revision: number }

export function ContractLibrarySectionEditor({
  tenantId,
  initial,
  changed,
  saved,
  saving,
}: {
  tenantId: string
  initial: SectionDraft
  changed: () => void
  saved: () => void
  saving: (busy: boolean) => void
}) {
  const [section, setSection] = useState(initial)
  const [busy, setBusy] = useState(false)
  const cache = useQueryClient()
  function update(patch: Partial<SectionDraft>) {
    setSection((current) => ({ ...current, ...patch }))
    changed()
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !section.title.trim()) return
    setBusy(true)
    saving(true)
    try {
      const revision = await saveLibrarySection(tenantId, {
        ...section,
        title: section.title.trim(),
      })
      setSection((current) => ({ ...current, title: current.title.trim(), revision }))
      await cache.invalidateQueries({ queryKey: ['contract-template-library', tenantId] })
      saved()
      toast.success('Sección guardada')
    } catch (error) {
      toast.error('No se pudo guardar la sección', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
      saving(false)
    }
  }
  const snapshot = {
    id: section.id,
    title: section.title,
    content: section.content,
    pageBreakBefore: section.page_break_before,
    ...(section.format === 'markdown' ? { format: 'markdown' as const } : {}),
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <form className="space-y-5" onSubmit={(event) => void save(event)}>
        <div>
          <h2 className="text-lg font-semibold">Editar sección</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Reutilízala en tantas plantillas como necesites.
          </p>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <TextField
            label="Título"
            value={section.title}
            onChange={(title) => update({ title })}
            placeholder="Ej. Condiciones del servicio"
            maxLength={200}
            required
          />
          <TextareaField
            label="Contenido"
            value={section.content}
            onChange={(content) => update({ content })}
            placeholder="Escribe aquí. Puedes usar **negrita**, listas y enlaces."
            maxLength={10000}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={section.format === 'markdown'}
              onChange={(event) => update({ format: event.target.checked ? 'markdown' : 'plain' })}
            />{' '}
            Interpretar contenido como Markdown
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={section.page_break_before}
              onChange={(event) => update({ page_break_before: event.target.checked })}
            />{' '}
            Empezar en una página nueva
          </label>
        </fieldset>
        <p className="text-muted-foreground text-xs">
          Al editar una sección cambian las plantillas que la usan, pero no los contratos ya
          guardados.
        </p>
        <Button type="submit" isDisabled={busy || !section.title.trim()}>
          {busy ? 'Guardando…' : 'Guardar sección'}
        </Button>
      </form>
      <aside
        className="rounded-xl border bg-white p-6 text-black shadow-sm"
        aria-label="Vista previa de la sección"
      >
        <p className="mb-5 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Vista previa
        </p>
        {section.title || section.content ? (
          <ContractTemplateContent section={snapshot} />
        ) : (
          <p className="text-sm text-neutral-500">Empieza a escribir para ver la sección.</p>
        )}
      </aside>
    </div>
  )
}
