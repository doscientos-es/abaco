import { TableRow } from '@doscientos/ui'
import type { MouseEvent, ReactNode } from 'react'

const interactive =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [contenteditable]:not([contenteditable="false"]), [data-row-action]'

/** The existing link supplies keyboard navigation; the row adds a larger pointer target. */
export function NavigableTableRow({
  children,
  onOpen,
}: {
  children: ReactNode
  onOpen: () => void
}) {
  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    const target = event.target as Node
    if (!event.currentTarget.contains(target)) return
    const element = target.nodeType === 1 ? (target as Element) : target.parentElement
    const control = element?.closest(interactive)
    if (control && event.currentTarget.contains(control)) return
    if (event.currentTarget.ownerDocument.getSelection()?.toString()) return
    onOpen()
  }

  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      {children}
    </TableRow>
  )
}
