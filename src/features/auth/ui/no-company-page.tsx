import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { useSession } from '../application/auth-actions'
import { AuthLayout } from './auth-layout'
import { CompanyDialog } from './company-dialog'
import { useSignOut } from './use-sign-out'

/** Signed in, but the account has not been added to any company yet. */
export function NoCompanyPage() {
  const session = useSession()
  const [creating, setCreating] = useState(false)
  const signOut = useSignOut()
  return (
    <AuthLayout
      title="Aún no tienes acceso"
      description={`Has entrado como ${session?.email ?? ''}, pero tu cuenta no pertenece a ninguna empresa. Pide a quien administra la tuya que te invite, o crea una nueva.`}
    >
      <Button className="w-full" onPress={() => setCreating(true)}>
        Crear una empresa
      </Button>
      <CompanyDialog open={creating} onClose={() => setCreating(false)} />
      <Button variant="outline" className="w-full" onPress={() => void signOut()}>
        Cerrar sesión
      </Button>
    </AuthLayout>
  )
}
