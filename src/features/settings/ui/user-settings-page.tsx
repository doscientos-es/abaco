import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { useCompanyActions, useSession } from '@/features/auth'

export function UserSettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Ajustes</h1>
      <AccountSettings />
    </div>
  )
}

export function AccountSettings() {
  const session = useSession()
  const { switchTo } = useCompanyActions()
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const companies = session?.companies ?? []

  async function changeCompany(id: string) {
    if (switching || id === session?.tenantId || !companies.some((company) => company.id === id))
      return
    setError(null)
    setSwitching(true)
    try {
      await switchTo(id)
    } catch {
      setError('No se pudo cambiar de empresa. Inténtalo de nuevo.')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Cuenta y seguridad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {session?.fullName ? <p className="font-medium">{session.fullName}</p> : null}
          <p className="text-muted-foreground text-sm">{session?.email}</p>
          <Link to="/nueva-contrasena" className="text-sm font-medium underline">
            Cambiar contraseña
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mis empresas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {companies.length > 1
              ? 'Elige la empresa en la que quieres trabajar.'
              : 'Solo tienes acceso a esta empresa.'}
          </p>
          <ul className="space-y-2">
            {companies.map((company) => (
              <li key={company.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{company.name}</span>
                {company.id === session?.tenantId ? (
                  <span className="text-muted-foreground text-sm">Empresa actual</span>
                ) : (
                  <Button
                    variant="outline"
                    isDisabled={switching}
                    onPress={() => void changeCompany(company.id)}
                  >
                    Cambiar a {company.name}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {switching ? <output>Cambiando de empresa…</output> : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
