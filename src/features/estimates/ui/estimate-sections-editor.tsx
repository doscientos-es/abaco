import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@doscientos/ui'
import { ArrowDown, ArrowUp, Copy, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import {
  editableEstimateSectionTypes,
  estimateSectionLabels,
  estimateSectionLimits,
  isRequiredEstimateSection,
  type EstimateSection,
  type EstimateSectionType,
} from '@/shared/domain/estimate-document'
import type { Estimate } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'

import {
  changeEstimateSectionType,
  createEstimateSection,
  duplicateEstimateSection,
  estimateSectionHasContent,
  ensureRequiredEstimateSections,
  requiredEstimateSectionsError,
  moveEstimateSection,
  removeEstimateSection,
} from '../domain/estimate-sections'
import { usePatchEstimate } from './estimate-draft-context'
import { EstimateSectionContentEditor } from './estimate-section-content-editor'
import { EstimateSectionPriceEditor } from './estimate-section-price-editor'

export function EstimateSectionsEditor({ estimate }: { estimate: Estimate }) {
  const patchEstimate = usePatchEstimate()
  const sections = estimate.sections ?? []
  const [removing, setRemoving] = useState<EstimateSection | null>(null)
  const [changingType, setChangingType] = useState<{
    sectionId: string
    type: EstimateSectionType
  } | null>(null)
  const atLimit = sections.length >= estimateSectionLimits.sections
  const setSections = (value: EstimateSection[]) => patchEstimate(estimate.id, { sections: value })
  const updateSection = (value: EstimateSection) =>
    setSections(sections.map((section) => (section.id === value.id ? value : section)))

  useEffect(() => {
    if (estimate.status !== 'draft') return
    const current = estimate.sections ?? []
    const required = ensureRequiredEstimateSections(current, newId)
    if (required !== current) patchEstimate(estimate.id, { sections: required })
  }, [estimate, patchEstimate])

  const requirementsError = requiredEstimateSectionsError(estimate)

  return (
    <section aria-label="Secciones del presupuesto" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Contenido de la propuesta</h2>
        <p className="text-muted-foreground text-sm">
          Precio y Servicios son secciones únicas y obligatorias. Puedes reordenarlas y añadir
          textos donde quieras.
        </p>
      </div>
      {requirementsError ? (
        <p role="alert" className="text-destructive text-sm">
          {requirementsError}
        </p>
      ) : null}
      {sections.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Añade la primera sección de tu propuesta.
        </p>
      ) : null}
      {sections.map((section, index) => (
        <Card key={section.id}>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs font-medium">
                {index + 1}. {estimateSectionLabels[section.type]}
                {isRequiredEstimateSection(section.type) ? ' · Obligatoria' : ''}
              </p>
              <div className="flex gap-1">
                <IconButton
                  variant="ghost"
                  label={`Subir sección ${index + 1}`}
                  isDisabled={index === 0}
                  onPress={() => setSections(moveEstimateSection(sections, section.id, -1))}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </IconButton>
                <IconButton
                  variant="ghost"
                  label={`Bajar sección ${index + 1}`}
                  isDisabled={index === sections.length - 1}
                  onPress={() => setSections(moveEstimateSection(sections, section.id, 1))}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </IconButton>
                {!isRequiredEstimateSection(section.type) ? (
                  <>
                    <IconButton
                      variant="ghost"
                      label={`Duplicar sección ${index + 1}`}
                      isDisabled={atLimit}
                      onPress={() =>
                        patchEstimate(
                          estimate.id,
                          duplicateEstimateSection(estimate, section.id, newId),
                        )
                      }
                    >
                      <Copy aria-hidden="true" className="size-4" />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      label={`Eliminar sección ${index + 1}`}
                      onPress={() => setRemoving(section)}
                    >
                      <Trash aria-hidden="true" className="size-4" />
                    </IconButton>
                  </>
                ) : null}
              </div>
            </div>
            {!isRequiredEstimateSection(section.type) ? (
              <SelectField
                label={`Tipo de la sección ${index + 1}`}
                value={section.type}
                options={[
                  ...editableEstimateSectionTypes.map((type) => ({
                    value: type,
                    label: estimateSectionLabels[type],
                  })),
                  ...(section.type === 'list'
                    ? [{ value: 'list', label: estimateSectionLabels.list }]
                    : []),
                ]}
                onChange={(value) => {
                  const type = value as EstimateSectionType
                  if (section.type === type || isRequiredEstimateSection(type)) return
                  if (estimateSectionHasContent(section)) {
                    setChangingType({ sectionId: section.id, type })
                  } else {
                    patchEstimate(
                      estimate.id,
                      changeEstimateSectionType(estimate, section.id, type, newId),
                    )
                  }
                }}
              />
            ) : null}
            {section.type !== 'prices' ? (
              <TextField
                label={`Título de la sección ${index + 1}`}
                placeholder="Ej. Alcance del servicio"
                value={section.title}
                maxLength={200}
                onChange={(title) => updateSection({ ...section, title })}
              />
            ) : null}
            {section.type === 'prices' ? (
              <EstimateSectionPriceEditor estimate={estimate} section={section} />
            ) : (
              <EstimateSectionContentEditor section={section} onChange={updateSection} />
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={section.pageBreakBefore}
                onChange={(event) =>
                  updateSection({ ...section, pageBreakBefore: event.target.checked })
                }
              />
              Empezar esta sección en una página nueva al imprimir
            </label>
          </CardContent>
        </Card>
      ))}
      <DropdownMenuTrigger>
        <Button variant="outline" isDisabled={atLimit}>
          <Plus aria-hidden="true" className="size-4" />
          Añadir sección
        </Button>
        <DropdownMenuContent placement="bottom start">
          {editableEstimateSectionTypes.map((type) => (
            <DropdownMenuItem
              key={type}
              onAction={() => setSections([...sections, createEstimateSection(type, newId)])}
            >
              {estimateSectionLabels[type]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuTrigger>
      {atLimit ? (
        <p className="text-muted-foreground text-xs">
          Máximo {estimateSectionLimits.sections} secciones por presupuesto.
        </p>
      ) : null}
      <ConfirmDialog
        open={changingType !== null}
        onOpenChange={(open) => {
          if (!open) setChangingType(null)
        }}
        title="¿Cambiar el tipo de sección?"
        description="Se eliminará el contenido de esta sección para usar el nuevo tipo. El título y la posición se conservarán."
        destructive
        confirmLabel="Cambiar tipo"
        onConfirm={() => {
          if (changingType) {
            patchEstimate(
              estimate.id,
              changeEstimateSectionType(estimate, changingType.sectionId, changingType.type, newId),
            )
          }
          setChangingType(null)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="¿Eliminar sección?"
        description="Se eliminarán esta sección y su contenido."
        destructive
        confirmLabel="Eliminar sección"
        onConfirm={() => {
          if (removing) patchEstimate(estimate.id, removeEstimateSection(estimate, removing.id))
          setRemoving(null)
        }}
      />
    </section>
  )
}
