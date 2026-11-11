import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'

import { TextareaField, TextField } from '@/shared/ui/form'

export function ManualAcceptanceCard({
  draft,
  name,
  evidence,
  busy,
  onNameChange,
  onEvidenceChange,
  onSubmit,
}: {
  draft: boolean
  name: string
  evidence: string
  busy: boolean
  onNameChange: (value: string) => void
  onEvidenceChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar aprobación del cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Registra una aceptación que ya hayas recibido. No representa una firma del cliente en
          Ábaco y no se puede deshacer.{' '}
          {draft
            ? 'Al confirmar se publicará y bloqueará esta versión, sin enviar ningún correo.'
            : ''}
        </p>
        <TextField
          label="Nombre de quien aceptó"
          value={name}
          onChange={onNameChange}
          placeholder="Nombre comunicado por el cliente"
          minLength={2}
          maxLength={120}
        />
        <TextareaField
          label="Referencia de la evidencia"
          value={evidence}
          onChange={onEvidenceChange}
          placeholder="Ejemplo: correo de aceptación conservado en el expediente del cliente"
          helper="Indica dónde se conserva el correo, documento o autorización original."
          minLength={12}
          maxLength={2000}
        />
        <Button isDisabled={busy} onPress={onSubmit}>
          {busy ? 'Registrando…' : 'Confirmar aprobación'}
        </Button>
      </CardContent>
    </Card>
  )
}
