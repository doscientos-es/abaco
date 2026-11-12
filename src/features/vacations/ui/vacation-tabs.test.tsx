import { Tabs, TabsContent, TabsList, TabsTrigger } from '@doscientos/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

it('keeps the calendar mounted but inert and hidden when the inbox is selected', () => {
  const html = renderToStaticMarkup(
    <Tabs selectedKey="pending">
      <TabsList aria-label="Secciones de ausencias">
        <TabsTrigger id="calendar">Calendario</TabsTrigger>
        <TabsTrigger id="pending">Pendientes</TabsTrigger>
      </TabsList>
      <TabsContent id="calendar" shouldForceMount className="data-[inert]:hidden">
        Vista del calendario
      </TabsContent>
      <TabsContent id="pending">Bandeja de solicitudes</TabsContent>
    </Tabs>,
  )
  expect(html).toMatch(/data-inert[^>]*>Vista del calendario/)
  expect(html).toContain('data-[inert]:hidden')
  expect(html).toContain('Bandeja de solicitudes')
})
