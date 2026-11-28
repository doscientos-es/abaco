export const visitReportTemplatePresets = [
  {
    kind: 'cleaning',
    title: 'Limpieza',
    labels: [
      'Comprobar las zonas incluidas en el servicio',
      'Limpiar superficies y puntos de contacto',
      'Reponer consumibles y retirar residuos',
      'Revisar el resultado antes de finalizar',
    ],
  },
  {
    kind: 'hvac',
    title: 'Climatización',
    labels: [
      'Revisar el estado general del equipo y los filtros',
      'Comprobar la ventilación y el desagüe de condensados',
      'Verificar la respuesta a la temperatura de consigna',
      'Anotar las anomalías detectadas',
    ],
  },
  {
    kind: 'commissioning',
    title: 'Puesta en marcha',
    labels: [
      'Confirmar que la instalación está lista para arrancar',
      'Verificar alarmas y protecciones según el equipo',
      'Realizar la prueba de funcionamiento',
      'Explicar el uso básico a la persona responsable',
    ],
  },
] as const

export type VisitReportTemplateKind = (typeof visitReportTemplatePresets)[number]['kind']

export type VisitReportTemplate = {
  service_kind: VisitReportTemplateKind
  draft_revision: number
  draft_labels: string[]
  published_version: number | null
  published_labels: string[] | null
}

export function parseTemplateLabels(value: string) {
  const labels = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (labels.length < 1 || labels.length > 20)
    return { error: 'Escribe entre 1 y 20 comprobaciones, una por línea.' } as const
  if (labels.some((label) => Array.from(label).length > 160 || /\p{Cc}/u.test(label)))
    return { error: 'Usa como máximo 160 caracteres de texto por comprobación.' } as const
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length)
    return { error: 'Elimina las comprobaciones repetidas.' } as const
  return { labels } as const
}
