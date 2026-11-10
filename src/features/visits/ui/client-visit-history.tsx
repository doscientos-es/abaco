import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { SelectField } from '@/shared/ui/form'

import { listClientVisitHistory } from '../application/paper-visit-actions'
import { PaperVisitPanel } from './paper-visit-panel'

const statuses = {scheduled:'Pendiente',in_progress:'En curso',completed:'Realizada',canceled:'Cancelada',skipped:'Omitida'}

export function ClientVisitHistory({tenantId,clientId,clientName,locations}:{tenantId:string;clientId:string;clientName:string;locations:readonly {id:string;name:string}[]}) {
  const [location,setLocation] = useState('')
  const [page,setPage] = useState(0)
  const [selected,setSelected] = useState<string|null>(null)
  const history = useQuery({queryKey:['client-cleaning-history',tenantId,clientId,location,page],queryFn:() => listClientVisitHistory(tenantId,clientId,location || null,page)})
  return <section className="space-y-4 rounded-lg border p-4" aria-label="Historial de servicios del cliente">
    <h2 className="text-lg font-semibold">Servicios, partes e historial</h2>
    <SelectField label="Centro del historial" value={location} onChange={value => {setLocation(value);setPage(0);setSelected(null)}} options={[{value:'',label:'Todos los centros'},...locations.map(l => ({value:l.id,label:l.name}))]}/>
    {history.isPending ? <output>Cargando historial de servicios…</output> : null}
    {history.isError ? <p role="alert">No se pudo cargar el historial. <Button variant="outline" onPress={() => void history.refetch()}>Reintentar</Button></p> : null}
    {history.isSuccess && !history.data.length ? <p>No hay servicios registrados en esta página con estos filtros.</p> : null}
    <ol className="space-y-3">{history.data?.map(visit => <li key={visit.id} className="space-y-2 rounded border p-3">
      <p className="font-medium">{visit.title} · {visit.location_name}</p>
      <p className="text-sm">{new Date(visit.scheduled_start_at).toLocaleString('es-ES',{timeZone:visit.timezone})} · {statuses[visit.status]}</p>
      <Button variant="outline" onPress={() => setSelected(selected === visit.id ? null : visit.id)}>{selected === visit.id ? 'Cerrar detalle' : 'Ver parte, justificantes y cambios'}</Button>
      {selected === visit.id ? <PaperVisitPanel key={visit.id} tenantId={tenantId} visit={{...visit,client_name:visit.client_name || clientName}}/> : null}
    </li>)}</ol>
    <nav className="flex items-center gap-3" aria-label="Páginas del historial"><Button variant="outline" isDisabled={page === 0 || history.isPending} onPress={() => {setPage(page-1);setSelected(null)}}>Anterior</Button><span>Página {page+1}</span><Button variant="outline" isDisabled={history.isPending || history.isError || (history.data?.length ?? 0) < 25} onPress={() => {setPage(page+1);setSelected(null)}}>Siguiente</Button></nav>
  </section>
}