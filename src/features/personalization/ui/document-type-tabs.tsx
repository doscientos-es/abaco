import { Tabs, TabsContent, TabsList, TabsTrigger } from '@doscientos/ui'
import { useState, type ReactNode } from 'react'

import type { DocumentKind } from '@/shared/lib/send-document'

export function DocumentTypeTabs({
  label,
  children,
}: {
  label: string
  children: (type: DocumentKind) => ReactNode
}) {
  const [type, setType] = useState<DocumentKind>('estimate')
  return (
    <Tabs
      className="min-h-0 min-w-0 flex-1 gap-3"
      selectedKey={type}
      onSelectionChange={(key) => {
        if (key === 'estimate' || key === 'invoice') setType(key)
      }}
    >
      <TabsList aria-label={label} className="shrink-0 print:hidden">
        <TabsTrigger id="estimate">Presupuesto</TabsTrigger>
        <TabsTrigger id="invoice">Factura</TabsTrigger>
      </TabsList>
      <TabsContent id={type} key={type} className="flex min-h-0 flex-1 print:block">
        {children(type)}
      </TabsContent>
    </Tabs>
  )
}
