import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from '@doscientos/ui'

export function PlatformMenuSection({ onOpen }: { onOpen: () => void }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Plataforma</DropdownMenuLabel>
      <DropdownMenuItem onAction={onOpen}>Administración de Ábaco</DropdownMenuItem>
    </DropdownMenuGroup>
  )
}
