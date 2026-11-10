import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { absenceOccupancy } from '../domain/absence-occupancy'
import { monthWeeks, moveMonths } from '../domain/absence-calendar'
import { absenceTypeLabels, type VacationRequest } from '../domain/vacation-request'

export function AbsenceOverview({ requests, from, through, onRange }: { requests: VacationRequest[]; from: string; through: string; onRange: (from: string, through: string) => void }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()).slice(0, 7))
  const weeks = monthWeeks(`${month}-01`)
  const days = weeks.flat().filter((day): day is string => Boolean(day))
  const start = from || days[0] || ''
  const end = through || days.at(-1) || ''
  const totals = absenceOccupancy(requests, start, end)
  return <section className="space-y-3 rounded-lg border p-4" aria-label="Calendario de vacaciones y asuntos propios">
    <h2 className="font-semibold">Calendario y coincidencias</h2>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onPress={() => setMonth(moveMonths(`${month}-01`, -1).slice(0, 7))}>Mes anterior</Button><input aria-label="Mes de ausencias" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }} className="bg-background rounded border p-2" /><Button variant="outline" onPress={() => setMonth(moveMonths(`${month}-01`, 1).slice(0, 7))}>Mes siguiente</Button><Button variant="outline" onPress={() => onRange(`${month}-01`, `${month}-15`)}>Primera quincena</Button><Button variant="outline" onPress={() => onRange(`${month}-16`, days.at(-1) ?? '')}>Segunda quincena</Button></div>
    <p className="text-muted-foreground text-sm">Cada casilla cuenta personas únicas: aprobadas / pendientes. Pulsa un día para ver nombres. No se calculan saldos ni cupos.</p>
    <table className="w-full table-fixed text-center text-sm"><thead><tr>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, i) => <th key={i} scope="col">{label}</th>)}</tr></thead><tbody>{weeks.map((week, i) => <tr key={i}>{week.map((day, j) => { if (!day) return <td key={j} aria-label="Fuera de mes" />; const count = absenceOccupancy(requests, day, day); return <td key={day} className="border p-1"><button type="button" className={`w-full rounded p-2 ${day >= start && day <= end ? 'bg-accent text-accent-foreground' : ''}`} onClick={() => onRange(day, day)} aria-label={`${day}: ${count.approvedPeople} personas aprobadas, ${count.pendingPeople} pendientes`}><span className="block">{Number(day.slice(8))}</span><span className="text-xs">{count.approvedPeople} / {count.pendingPeople}</span></button></td> })}</tr>)}</tbody></table>
    <h3 className="font-medium">{start} — {end}</h3>
    <p>{totals.approvedPeople} personas con alguna ausencia aprobada · {totals.pendingPeople} con alguna petición pendiente en el intervalo. No significa que coincidan todas el mismo día.</p>
    <ul className="space-y-1 text-sm">{[...totals.approved, ...totals.pending].map(r => <li key={r.id}>{r.requesterName} · {r.startDate} — {r.endDate ?? 'Sin fin confirmado'} · {absenceTypeLabels[r.absenceType]} · {r.status === 'approved' ? 'Aprobada' : 'Pendiente'}</li>)}</ul>
    {!totals.approved.length && !totals.pending.length ? <p>No hay ausencias aprobadas ni pendientes en este intervalo.</p> : null}
  </section>
}