import type { ReactNode } from 'react'

import './personalization-workspace.css'

export function PersonalizationWorkspace({
  preview,
  previewLabel,
  controls,
  controlsLabel,
  saveActions,
}: {
  preview: ReactNode
  previewLabel: string
  controls: ReactNode
  controlsLabel: string
  saveActions: ReactNode
}) {
  return (
    <div className="personalization-workspace min-w-0">
      <section
        aria-label={previewLabel}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the preview independently.
        tabIndex={0}
        className="personalization-workspace__scroll focus-visible:outline-ring rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        {preview}
      </section>
      <aside
        aria-label={controlsLabel}
        className="border-border bg-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border print:hidden"
      >
        <div className="personalization-workspace__scroll flex-1 space-y-5 p-4">{controls}</div>
        <footer className="border-border bg-card shrink-0 border-t p-3">{saveActions}</footer>
      </aside>
    </div>
  )
}
