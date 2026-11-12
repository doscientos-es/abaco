import type * as UI from '@doscientos/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { RowActions } from './table-row-actions'

const actions = vi.hoisted(() => new Map<string, () => void>())
vi.mock('@doscientos/ui', async (original) => {
  const ui = await original<typeof UI>()
  return {
    ...ui,
    IconButton: (props: UI.IconButtonProps) => {
      if (props.onPress) actions.set(props.label, () => props.onPress?.({} as never))
      return <ui.IconButton {...props} />
    },
  }
})

it('renders accessible edit and delete buttons and dispatches their actions', () => {
  const edit = vi.fn()
  const remove = vi.fn()
  const html = renderToStaticMarkup(<RowActions name="Tornillo" onEdit={edit} onDelete={remove} />)
  expect(html).toContain('aria-label="Editar Tornillo"')
  expect(html).toContain('aria-label="Eliminar Tornillo"')
  actions.get('Editar Tornillo')?.()
  actions.get('Eliminar Tornillo')?.()
  expect(edit).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledOnce()
})
