import { Button } from '@doscientos/ui'
import { FileText, Plus, SquaresFour } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { loadContractTemplateLibrary } from '../application/contract-template-library-actions'
import { ContractLibrarySectionEditor, type SectionDraft } from './contract-library-section-editor'
import { ContractLibraryTemplateEditor } from './contract-library-template-editor'

type Selection = { kind: 'section' | 'template'; id: string }

export function ContractTemplateLibrary({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ['contract-template-library', tenantId],
    queryFn: () => loadContractTemplateLibrary(tenantId),
  })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newSection, setNewSection] = useState<SectionDraft | null>(null)
  function choose(next: Selection, freshSection?: SectionDraft) {
    if (saving || (selection?.kind === next.kind && selection.id === next.id)) return
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return
    setDirty(false)
    if (freshSection) setNewSection(freshSection)
    setSelection(next)
  }
  if (query.isPending) return <output>Cargando biblioteca…</output>
  if (query.isError)
    return <p role="alert">No se pudo cargar la biblioteca: {query.error.message}</p>
  const { sections, templates } = query.data
  const section =
    selection?.kind === 'section'
      ? (sections.find((item) => item.id === selection.id) ??
        (newSection?.id === selection.id ? newSection : null))
      : null
  const template =
    selection?.kind === 'template'
      ? (templates.find((item) => item.id === selection.id) ?? {
          id: selection.id,
          name: '',
          before_ids: [],
          after_ids: [],
          revision: 0,
        })
      : null
  const itemClass = (active: boolean) =>
    `w-full rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'}`
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="text-xl font-semibold">Biblioteca de contratos</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Crea secciones reutilizables y combínalas en plantillas para tus contratos.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          className="bg-card space-y-5 rounded-xl border p-4"
          aria-label="Biblioteca de plantillas"
        >
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
                <SquaresFour aria-hidden="true" className="size-4" /> Plantillas
              </h3>
              <button
                type="button"
                aria-label="Nueva plantilla"
                className="text-primary hover:bg-muted rounded p-1"
                onClick={() => choose({ kind: 'template', id: crypto.randomUUID() })}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {templates.length ? (
              templates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selection?.id === item.id && selection.kind === 'template'}
                  className={itemClass(selection?.id === item.id && selection.kind === 'template')}
                  onClick={() => choose({ kind: 'template', id: item.id })}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <p className="text-muted-foreground px-3 text-xs">Todavía no hay plantillas.</p>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
                <FileText aria-hidden="true" className="size-4" /> Secciones
              </h3>
              <button
                type="button"
                aria-label="Nueva sección"
                className="text-primary hover:bg-muted rounded p-1"
                onClick={() => {
                  const item: SectionDraft = {
                    id: crypto.randomUUID(),
                    title: '',
                    content: '',
                    page_break_before: false,
                    format: 'markdown',
                    revision: 0,
                  }
                  choose({ kind: 'section', id: item.id }, item)
                }}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {sections.length ? (
              sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selection?.id === item.id && selection.kind === 'section'}
                  className={itemClass(selection?.id === item.id && selection.kind === 'section')}
                  onClick={() => choose({ kind: 'section', id: item.id })}
                >
                  {item.title || 'Sin título'}
                </button>
              ))
            ) : (
              <p className="text-muted-foreground px-3 text-xs">Todavía no hay secciones.</p>
            )}
          </div>
        </nav>
        <div className="bg-card min-w-0 rounded-xl border p-5 sm:p-6">
          {section ? (
            <ContractLibrarySectionEditor
              key={section.id}
              tenantId={tenantId}
              initial={section}
              changed={() => setDirty(true)}
              saved={() => setDirty(false)}
              saving={setSaving}
            />
          ) : null}
          {template ? (
            <ContractLibraryTemplateEditor
              key={template.id}
              tenantId={tenantId}
              initial={template}
              sections={sections}
              changed={() => setDirty(true)}
              saved={() => setDirty(false)}
              saving={setSaving}
            />
          ) : null}
          {!selection ? (
            <div className="space-y-4 py-12 text-center">
              <h3 className="text-lg font-semibold">Tu contenido, organizado</h3>
              <p className="text-muted-foreground mx-auto max-w-md text-sm">
                Empieza creando secciones y después selecciona cuáles formarán cada plantilla.
              </p>
              <Button
                onPress={() => {
                  const item: SectionDraft = {
                    id: crypto.randomUUID(),
                    title: '',
                    content: '',
                    page_break_before: false,
                    format: 'markdown',
                    revision: 0,
                  }
                  choose({ kind: 'section', id: item.id }, item)
                }}
              >
                Crear primera sección
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
