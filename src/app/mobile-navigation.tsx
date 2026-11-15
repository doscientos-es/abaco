import { Button, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@doscientos/ui'
import { Link, useNavigate } from '@tanstack/react-router'

import type { NavItem } from './frame-navigation'
import { navIcons } from './nav-icons'

import './mobile-navigation.css'

function matchesPath(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`))
}

export function MobileNavigation({
  items,
  moreItems = [],
  pathname,
}: {
  items: NavItem[]
  moreItems?: NavItem[]
  pathname?: string
}) {
  const navigate = useNavigate()
  const moreActive = pathname && moreItems.some((item) => matchesPath(pathname, item.to))
  return (
    <nav
      aria-label="Navegación móvil"
      className="mobile-bottom-nav"
      style={{
        gridTemplateColumns: `repeat(${items.length + Number(moreItems.length > 0)}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-label={item.label}
          activeOptions={{ exact: item.to === '/' }}
          activeProps={{ className: 'mobile-bottom-nav__link--active' }}
          className="mobile-bottom-nav__link"
        >
          {item.icon}
          <span>{item.mobileLabel ?? item.label}</span>
        </Link>
      ))}
      {moreItems.length > 0 ? (
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            aria-label="Más secciones"
            className={`mobile-bottom-nav__link ${moreActive ? 'mobile-bottom-nav__link--active' : ''}`}
          >
            {navIcons.more}
            <span>Más</span>
          </Button>
          <DropdownMenuContent placement="top end" className="max-h-[60vh] overflow-y-auto">
            {moreItems.map((item) => (
              <DropdownMenuItem key={item.to} onAction={() => void navigate({ to: item.to })}>
                {item.icon} {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenuTrigger>
      ) : null}
    </nav>
  )
}
