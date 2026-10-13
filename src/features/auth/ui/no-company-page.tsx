import { Button } from '@doscientos/ui'

import { useSession } from '../application/auth-actions'
import { AuthLayout } from './auth-layout'
import { useSignOut } from './use-sign-out'

/** Signed in, but the account has not been added to any company yet. */
export function NoCompanyPage() {
  const session = useSession()
  const signOut = useSignOut()
  return (
    <AuthLayout
      title="Aún no tienes acceso"
      description={`Has entrado como ${session?.email ?? ''}, pero tu cuenta no pertenece a ninguna empresa. Pide a quien administra la tuya que te invite.`}
    >
      <Button variant="outline" className="w-full" onPress={() => void signOut()}>
        Cerrar sesión
      </Button>
    </AuthLayout>
  )
}
