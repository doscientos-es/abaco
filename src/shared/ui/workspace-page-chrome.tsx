import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ChromeTargets = { heading: HTMLElement | null; tabs: HTMLElement | null }

export const WorkspaceChromeContext = createContext<ChromeTargets | null>(null)

/** Render page-owned controls in the shell, or in place when there is no shell. */
function ChromeSlot({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : children
}

export function WorkspacePageHeading({
  title,
  actions,
}: {
  title: ReactNode
  actions?: ReactNode
}) {
  const chrome = useContext(WorkspaceChromeContext)
  return (
    <ChromeSlot target={chrome?.heading ?? null}>
      <div className="workspace-page-heading">
        <h1>{title}</h1>
        {actions ? <div className="workspace-page-heading__actions">{actions}</div> : null}
      </div>
    </ChromeSlot>
  )
}

export function WorkspacePageTabs({ children }: { children: ReactNode }) {
  const chrome = useContext(WorkspaceChromeContext)
  return (
    <ChromeSlot target={chrome?.tabs ?? null}>
      <div className="workspace-section-tabs">{children}</div>
    </ChromeSlot>
  )
}
