import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import type { ReactNode } from 'react'

import { vacationRequestStatusLabels, type VacationRequest } from '../domain/vacation-request'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00.000Z`),
  )
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function VacationRequestCard({
  request,
  showRequester = false,
  children,
}: {
  request: VacationRequest
  showRequester?: boolean
  children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {formatDate(request.startDate)}
            {request.startDate !== request.endDate ? ` – ${formatDate(request.endDate)}` : ''}
          </CardTitle>
          {showRequester ? (
            <p className="text-muted-foreground text-sm">{request.requesterName}</p>
          ) : null}
        </div>
        <span
          className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium"
          aria-label={`Estado: ${vacationRequestStatusLabels[request.status]}`}
        >
          {vacationRequestStatusLabels[request.status]}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {request.comment ? (
          <p className="whitespace-pre-line">
            <span className="font-medium">Comentario: </span>
            {request.comment}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Solicitada el{' '}
          <time dateTime={request.submittedAt}>{formatTimestamp(request.submittedAt)}</time>
        </p>
        {request.decidedAt ? (
          <div className="border-border space-y-1 border-t pt-3">
            <p>
              Decisión de {request.decidedByName} ·{' '}
              <time dateTime={request.decidedAt}>{formatTimestamp(request.decidedAt)}</time>
            </p>
            {request.decisionComment ? (
              <p className="whitespace-pre-line">{request.decisionComment}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}
