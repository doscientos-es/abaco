import { MapPinIcon } from '@phosphor-icons/react'

import { contactWhatsappLink, visitMapsLink } from '@/shared/lib/contact-links'

export function VisitMapsAction({
  address,
  label,
  showAddress = true,
  coordinates,
  addressMayBeIncomplete = false,
}: {
  address: string | null | undefined
  label: string
  showAddress?: boolean
  coordinates?: { latitude: number | null | undefined; longitude: number | null | undefined }
  addressMayBeIncomplete?: boolean
}) {
  const href = visitMapsLink(address, coordinates)
  if (!href) return <p className="text-muted-foreground text-sm">Sin dirección de visita.</p>
  return (
    <div className="space-y-1 text-sm">
      {showAddress ? (
        <p className="text-muted-foreground">{address || 'Sin dirección de visita.'}</p>
      ) : null}
      {addressMayBeIncomplete ? (
        <p className="text-muted-foreground">
          La dirección puede estar incompleta. Comprueba la localidad y el destino en Google Maps.
        </p>
      ) : null}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="text-primary inline-flex min-h-10 items-center gap-1 font-medium underline"
      >
        <MapPinIcon aria-hidden="true" />
        Cómo llegar en Google Maps
      </a>
    </div>
  )
}

export function ClientWhatsappAction({
  phone,
  label,
}: {
  phone: string | null | undefined
  label: string
}) {
  const href = contactWhatsappLink(phone)
  if (!href) {
    return (
      <p className="text-muted-foreground text-sm">
        {phone?.trim()
          ? 'WhatsApp no disponible: revisa el teléfono e incluye el prefijo internacional.'
          : 'WhatsApp no disponible: sin teléfono.'}
      </p>
    )
  }
  return (
    <div className="text-sm">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="text-primary inline-flex min-h-10 items-center font-medium underline"
      >
        Abrir WhatsApp
      </a>
      <p className="text-muted-foreground">
        Podrás revisar y editar el mensaje en WhatsApp antes de enviarlo.
      </p>
    </div>
  )
}
