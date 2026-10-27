import {
  CalendarBlank,
  DotsThreeCircle,
  FileText,
  GearSix,
  Handshake,
  House,
  Package,
  Receipt,
  UsersThree,
  Wallet,
  Wrench,
} from '@phosphor-icons/react'

const cls = 'size-[18px] shrink-0'

/** Sidebar icons (Phosphor, regular weight). */
export const navIcons = {
  home: <House aria-hidden="true" className={cls} />,
  estimates: <FileText aria-hidden="true" className={cls} />,
  clients: <UsersThree aria-hidden="true" className={cls} />,
  invoices: <Receipt aria-hidden="true" className={cls} />,
  catalog: <Package aria-hidden="true" className={cls} />,
  ledger: <Wallet aria-hidden="true" className={cls} />,
  work: <Wrench aria-hidden="true" className={cls} />,
  visits: <CalendarBlank aria-hidden="true" className={cls} />,
  contracts: <Handshake aria-hidden="true" className={cls} />,
  settings: <GearSix aria-hidden="true" className={cls} />,
  more: <DotsThreeCircle aria-hidden="true" className={cls} />,
} as const
