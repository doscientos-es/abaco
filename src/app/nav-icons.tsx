import { FileText, GearSix, House, Package, UsersThree, Wallet } from '@phosphor-icons/react'

const cls = 'size-[18px] shrink-0'

/** Sidebar icons (Phosphor, regular weight). */
export const navIcons = {
  home: <House aria-hidden="true" className={cls} />,
  estimates: <FileText aria-hidden="true" className={cls} />,
  clients: <UsersThree aria-hidden="true" className={cls} />,
  catalog: <Package aria-hidden="true" className={cls} />,
  ledger: <Wallet aria-hidden="true" className={cls} />,
  settings: <GearSix aria-hidden="true" className={cls} />,
} as const
