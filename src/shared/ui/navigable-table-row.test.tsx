import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { NavigableTableRow } from './navigable-table-row'

const capture = vi.hoisted(() => ({ onClick: undefined as ComponentProps<'tr'>['onClick'] }))
vi.mock('@doscientos/ui', () => ({
  TableRow: (props: ComponentProps<'tr'>) => {
    capture.onClick = props.onClick
    return <tr className={props.className}>{props.children}</tr>
  },
}))

describe('navigable table row', () => {
  function setup() {
    const open = vi.fn()
    const html = renderToStaticMarkup(
      <NavigableTableRow onOpen={open}>
        <td>
          <a href="/detail">Detalle</a>
        </td>
      </NavigableTableRow>,
    )
    expect(html).toContain('href="/detail"')
    expect(html).toContain('cursor-pointer')
    const contains = vi.fn().mockReturnValue(true)
    const closest = vi.fn().mockReturnValue(null)
    const target = { nodeType: 1, closest }
    const event = {
      button: 0,
      defaultPrevented: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target,
      currentTarget: { contains, ownerDocument: { getSelection: () => null } },
    }
    return { open, event, contains, closest }
  }

  it('opens from a normal cell without replacing the accessible link', () => {
    const { open, event } = setup()
    capture.onClick?.(event as never)
    expect(open).toHaveBeenCalledOnce()
  })

  it('ignores links and controls including their nested icons', () => {
    const { open, event, closest } = setup()
    closest.mockReturnValue({})
    capture.onClick?.(event as never)
    expect(open).not.toHaveBeenCalled()
    expect(closest.mock.calls[0]?.[0]).toContain('button')
    expect(closest.mock.calls[0]?.[0]).toContain('a,')
  })

  it('does not navigate after selection, modified clicks, prevented events, or portal clicks', () => {
    const { open, event, contains } = setup()
    capture.onClick?.({
      ...event,
      currentTarget: { contains, ownerDocument: { getSelection: () => 'texto' } },
    } as never)
    capture.onClick?.({ ...event, ctrlKey: true } as never)
    capture.onClick?.({ ...event, defaultPrevented: true } as never)
    contains.mockReturnValue(false)
    capture.onClick?.(event as never)
    expect(open).not.toHaveBeenCalled()
  })
})
