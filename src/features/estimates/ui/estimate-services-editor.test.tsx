import type * as UI from '@doscientos/ui'
import type * as React from 'react'
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstimateSection } from '@/shared/domain/estimate-document'

const controls = vi.hoisted(() => ({
  inputs: new Map<string, ComponentProps<typeof UI.Input>>(),
  buttons: new Map<
    string,
    ComponentProps<typeof UI.Button> | ComponentProps<typeof UI.IconButton>
  >(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useId: () => 'services-table',
}))
vi.mock('@doscientos/ui', async (original) => ({
  ...(await original<typeof UI>()),
  Input: (props: ComponentProps<typeof UI.Input>) => {
    controls.inputs.set(props['aria-label'] ?? '', props)
    return <input aria-label={props['aria-label']} value={props.value} readOnly />
  },
  Button: (props: ComponentProps<typeof UI.Button>) => {
    if (typeof props.children === 'string') controls.buttons.set(props.children, props)
    return <button disabled={props.isDisabled}>{props.children as ReactNode}</button>
  },
  IconButton: (props: ComponentProps<typeof UI.IconButton>) => {
    controls.buttons.set(props.label, props)
    return <button aria-label={props.label} />
  },
}))
vi.mock('@/shared/store/store', () => ({ newId: () => 'new-task' }))

import { EstimateSectionContentEditor } from './estimate-section-content-editor'
import { EstimateServicesTable, type ServiceSection } from './estimate-services-table'

const row = {
  id: 'task',
  task: 'Puerta principal',
  frequency: '',
  notes: 'Sin lejía',
  periodicities: [],
}
const initial: ServiceSection = {
  id: 'services',
  type: 'work_table',
  title: 'Servicios',
  pageBreakBefore: false,
  rows: [row],
}
let section: ServiceSection
const change = vi.fn((value: EstimateSection) => {
  if (value.type === 'work_table') section = value
})
const render = () =>
  renderToStaticMarkup(<EstimateSectionContentEditor section={section} onChange={change} />)
function radios() {
  const found: ComponentProps<'input'>[] = []
  function visit(node: ReactNode) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isValidElement(node)) return
    const element = node as ReactElement<ComponentProps<'input'> & { children?: ReactNode }>
    if (element.type === 'input' && element.props.type === 'radio') found.push(element.props)
    visit(element.props.children)
  }
  visit(
    EstimateServicesTable({
      rows: section.rows,
      onChange: (rows) => {
        section = { ...section, rows }
      },
    }),
  )
  return found
}
function radio(label: string) {
  const control = radios().find(
    (item) => item['aria-label'] === `${label} · Tarea 1: Puerta principal`,
  )
  if (!control?.onChange) throw new Error(`Missing radio: ${label}`)
  return control
}
beforeEach(() => {
  section = initial
  vi.clearAllMocks()
  controls.inputs.clear()
  controls.buttons.clear()
})

describe('service periodicity matrix', () => {
  it('renders six visible accessible radio columns in the real section editor', () => {
    const html = render()
    expect(html).toContain('<table')
    expect(html).toContain('Prescripciones técnicas')
    expect(html).toContain('Dos veces a la semana')
    expect(html).toContain('Anual')
    expect(html.match(/type="radio"/g)).toHaveLength(6)
    expect(html).not.toContain('type="checkbox"')
    expect(radios()).toHaveLength(6)
    expect(html).not.toContain('Frecuencia del trabajo')
  })

  it('selects one periodicity per task and replaces the previous selection', () => {
    radio('Diario').onChange?.({} as never)
    expect(radio('Diario').checked).toBe(true)
    radio('Mensual').onChange?.({} as never)
    expect(radio('Diario').checked).toBe(false)
    expect(radio('Mensual').checked).toBe(true)
    expect(section.rows).toEqual([{ ...row, periodicities: ['monthly'] }])
  })

  it('uses independent groups for each task and preserves legacy multiple selections until changed', () => {
    section = {
      ...initial,
      rows: [
        { ...row, periodicities: ['daily', 'monthly'] },
        { ...row, id: 'second', periodicities: ['annual'] },
      ],
    }
    const html = render()
    const options = radios()
    expect(new Set(options.slice(0, 6).map((item) => item.name)).size).toBe(1)
    expect(options[0]?.name).not.toBe(options[6]?.name)
    expect(options.slice(0, 6).some((item) => item.checked)).toBe(false)
    expect(html).toContain('Periodicidades guardadas: Diario, Mensual')
    expect(section.rows[0]?.periodicities).toEqual(['daily', 'monthly'])
    radio('Semanal').onChange?.({} as never)
    expect(section.rows.map((item) => item.periodicities)).toEqual([['weekly'], ['annual']])
  })

  it('edits only the task name without losing checked columns, notes or neighboring tasks', () => {
    section = {
      ...initial,
      rows: [
        { ...row, periodicities: ['annual'] },
        { ...row, id: 'second' },
      ],
    }
    render()
    const input = controls.inputs.get('Tarea 1')
    if (!input?.onChange) throw new Error('Missing task input')
    input.onChange({ target: { value: 'Nuevo nombre' } } as Parameters<
      NonNullable<typeof input.onChange>
    >[0])
    expect(section.rows).toEqual([
      { ...row, task: 'Nuevo nombre', periodicities: ['annual'] },
      { ...row, id: 'second' },
    ])
  })

  it('adds an unchecked task and removes only the chosen task', () => {
    render()
    controls.buttons.get('Añadir tarea')?.onPress?.({} as never)
    expect(section.rows[1]).toEqual({
      id: 'new-task',
      task: '',
      frequency: '',
      notes: '',
      periodicities: [],
    })
    render()
    controls.buttons.get('Eliminar tarea 1')?.onPress?.({} as never)
    expect(section.rows.map(({ id }) => id)).toEqual(['new-task'])
  })

  it('disables adding beyond the service-row limit', () => {
    section = {
      ...initial,
      rows: Array.from({ length: 100 }, (_, index) => ({ ...row, id: String(index) })),
    }
    render()
    expect(controls.buttons.get('Añadir tarea')?.isDisabled).toBe(true)
  })

  it('renders agreed marks, notes and custom legacy frequency without interactive controls', () => {
    const html = renderToStaticMarkup(
      <EstimateServicesTable
        rows={[
          { ...row, periodicities: ['daily', 'monthly'] },
          {
            id: 'legacy',
            task: 'Cristales <script>',
            frequency: 'Según necesidad',
            notes: 'Recepción',
          },
        ]}
      />,
    )
    expect(html.match(/>X<\/span>/g)).toHaveLength(2)
    expect(html).toContain('Sin lejía')
    expect(html).toContain('Según necesidad')
    expect(html).toContain('Recepción')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<button')
  })
})
