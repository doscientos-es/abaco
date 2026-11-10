import { Button, toast } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'

import { printDocument } from '@/shared/lib/print-document'

import { loadPaperSnapshots } from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'
import { PaperWorkSheet } from './paper-work-sheet'

export function BatchWorkSheets({tenantId,visits}:{tenantId:string;visits:VisitSummary[]}) {
  const sheet = useRef<HTMLDivElement>(null)
  const ids = visits.map(v => v.id)
  const snapshots = useQuery({queryKey:['paper-snapshots',tenantId,ids],enabled:ids.length>0,queryFn:() => loadPaperSnapshots(tenantId,ids)})
  return <div className="space-y-2">
    <Button variant="outline" isDisabled={!visits.length || !snapshots.isSuccess} onPress={() => {if (sheet.current) void printDocument(sheet.current,'Partes de la jornada').catch(() => toast.error('No se pudo preparar la impresión'))}}>Imprimir todos los partes visibles ({visits.length})</Button>
    {snapshots.isError ? <p role="alert">No se pudieron preparar los partes. <Button variant="ghost" onPress={() => void snapshots.refetch()}>Reintentar</Button></p> : null}
    <div hidden><div ref={sheet}>{visits.map(visit => <PaperWorkSheet key={visit.id} visit={visit} snapshot={snapshots.data?.[visit.id] ?? {}} />)}</div></div>
  </div>
}