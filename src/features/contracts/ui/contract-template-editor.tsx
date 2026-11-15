import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { TextareaField, TextField } from '@/shared/ui/form'

import {
  loadContractDocumentTemplate,
  saveContractDocumentTemplate,
  type ContractDocumentSection,
  type ContractDocumentSections,
  type ContractDocumentTemplate,
} from '../application/contract-document-template-actions'
import { contractTemplateLimits } from '../domain/contract-document-template'

export function ContractTemplateEditor({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ['contract-document-template', tenantId],
    queryFn: () => loadContractDocumentTemplate(tenantId),
  })
  if (query.isPending) return <output>Cargando plantilla…</output>
  if (query.isError)
    return <p role="alert">No se pudo cargar la plantilla: {query.error.message}</p>
  return <TemplateForm key={tenantId} tenantId={tenantId} initial={query.data} />
}

function TemplateForm({
  tenantId,
  initial,
}: {
  tenantId: string
  initial: ContractDocumentTemplate
}) {
  const cache = useQueryClient()
  const [template, setTemplate] = useState(initial)
  const [busy, setBusy] = useState(false)

  function change(position: keyof ContractDocumentSections, sections: ContractDocumentSection[]) {
    setTemplate((current) => ({
      ...current,
      sections: { ...current.sections, [position]: sections },
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const revision = await saveContractDocumentTemplate(tenantId, template)
      const saved = { ...template, revision }
      // Keep edits made while the request was in flight; only the submitted copy was saved.
      setTemplate((current) => ({ ...current, revision }))
      cache.setQueryData(['contract-document-template', tenantId], saved)
      toast.success('Plantilla de contrato guardada')
    } catch (error) {
      toast.error('No se pudo guardar la plantilla', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-5 pt-4" onSubmit={(event) => void save(event)}>
      <p className="text-muted-foreground text-sm">
        Estas secciones se copian a los nuevos contratos. Los contratos existentes no cambian;
        puedes actualizar la plantilla desde cada borrador sin firmar.
      </p>
      <TemplateSections
        title="Antes del presupuesto"
        sections={template.sections.before}
        onChange={(items) => change('before', items)}
      />
      <TemplateSections
        title="Después del presupuesto"
        sections={template.sections.after}
        onChange={(items) => change('after', items)}
      />
      <Button type="submit" isDisabled={busy}>
        {busy ? 'Guardando…' : 'Guardar plantilla'}
      </Button>
    </form>
  )
}

function TemplateSections({
  title,
  sections,
  onChange,
}: {
  title: string
  sections: ContractDocumentSection[]
  onChange: (sections: ContractDocumentSection[]) => void
}) {
  function update(index: number, patch: Partial<ContractDocumentSection>) {
    onChange(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)))
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...sections]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const current = next[index]
    const other = next[target]
    if (!current || !other) return
    ;[next[index], next[target]] = [other, current]
    onChange(next)
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {sections.map((section, index) => (
        <div key={section.id} className="space-y-3 rounded-lg border p-4">
          <TextField
            label={`Título de la sección ${index + 1} · ${title}`}
            value={section.title}
            onChange={(title) => update(index, { title })}
            placeholder="Título de la sección"
            maxLength={contractTemplateLimits.title}
          />
          <TextareaField
            label={`Texto de la sección ${index + 1} · ${title}`}
            value={section.content}
            onChange={(content) => update(index, { content })}
            placeholder="Redacta el contenido"
            maxLength={contractTemplateLimits.content}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={section.pageBreakBefore}
              onChange={(event) => update(index, { pageBreakBefore: event.target.checked })}
            />
            Empezar en una página nueva
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              isDisabled={index === 0}
              onPress={() => move(index, -1)}
              aria-label={`Subir sección ${index + 1} · ${title}`}
            >
              Subir
            </Button>
            <Button
              type="button"
              variant="outline"
              isDisabled={index === sections.length - 1}
              onPress={() => move(index, 1)}
              aria-label={`Bajar sección ${index + 1} · ${title}`}
            >
              Bajar
            </Button>
            <Button
              type="button"
              variant="outline"
              onPress={() => onChange(sections.filter((_, i) => i !== index))}
              aria-label={`Eliminar sección ${index + 1} · ${title}`}
            >
              Eliminar
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        isDisabled={sections.length >= contractTemplateLimits.sections}
        onPress={() =>
          onChange([
            ...sections,
            { id: crypto.randomUUID(), title: '', content: '', pageBreakBefore: false },
          ])
        }
      >
        Añadir sección · {title.toLocaleLowerCase('es')}
      </Button>
    </section>
  )
}
