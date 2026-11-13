import { Tabs, TabsContent, TabsList, TabsTrigger } from '@doscientos/ui'
import type { ReactNode } from 'react'
import type * as ReactDOM from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const portal = vi.hoisted(() => vi.fn((children: ReactNode, _target: Element) => children))
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof ReactDOM>()),
  createPortal: portal,
}))

import {
  WorkspaceChromeContext,
  WorkspacePageHeading,
  WorkspacePageTabs,
} from './workspace-page-chrome'

describe('page chrome', () => {
  beforeEach(() => portal.mockClear())

  it('keeps the title, actions and navigation available without the shell', () => {
    const html = renderToStaticMarkup(
      <>
        <WorkspacePageHeading title="Trabajadores" actions={<button>Invitar</button>} />
        <WorkspacePageTabs>
          <nav aria-label="Secciones">Personas</nav>
        </WorkspacePageTabs>
      </>,
    )
    expect(html).toContain('<h1>Trabajadores</h1>')
    expect(html).toContain('<button>Invitar</button>')
    expect(html).toContain('aria-label="Secciones"')
    expect(portal).not.toHaveBeenCalled()
  })

  it('places the heading and navigation in their respective shell targets', () => {
    const heading = {} as HTMLElement
    const tabs = {} as HTMLElement
    renderToStaticMarkup(
      <WorkspaceChromeContext.Provider value={{ heading, tabs }}>
        <WorkspacePageHeading title="Trabajadores" actions={<button>Invitar</button>} />
        <WorkspacePageTabs>
          <nav aria-label="Secciones">Personas</nav>
        </WorkspacePageTabs>
      </WorkspaceChromeContext.Provider>,
    )
    expect(portal).toHaveBeenCalledTimes(2)
    expect(portal.mock.calls[0]?.[1]).toBe(heading)
    expect(portal.mock.calls[1]?.[1]).toBe(tabs)
  })

  it('preserves the tab list and selected panel when navigation is moved to the shell', () => {
    const tabs = {} as HTMLElement
    const html = renderToStaticMarkup(
      <WorkspaceChromeContext.Provider value={{ heading: null, tabs }}>
        <Tabs selectedKey="teams">
          <WorkspacePageTabs>
            <TabsList aria-label="Secciones de trabajadores">
              <TabsTrigger id="people">Personas</TabsTrigger>
              <TabsTrigger id="teams">Equipos</TabsTrigger>
            </TabsList>
          </WorkspacePageTabs>
          <TabsContent id="teams">Contenido de equipos</TabsContent>
        </Tabs>
      </WorkspaceChromeContext.Provider>,
    )
    expect(html).toContain('aria-label="Secciones de trabajadores"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('Contenido de equipos')
    expect(portal.mock.calls[0]?.[1]).toBe(tabs)
  })
})
