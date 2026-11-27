import type { ReactNode } from 'react'

import doscientosLogo from '@/shared/assets/logo.svg'
import { brand } from '@/shared/lib/brand'

import './login.css'

export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="login-layout">
      <aside className="login-brand-panel">
        <div className="login-brand-logo">
          <img src={brand.mark} alt="" />
          <span>{brand.name}</span>
        </div>
        <div className="login-brand-content">
          <h2>{brand.promise}</h2>
          <p>
            Presupuestos, visitas y partes de trabajo. La oficina y el equipo, en la misma página.
          </p>
        </div>
        <p className="login-brand-tagline">{brand.tagline}</p>
      </aside>

      <div className="login-main">
        <div className="login-mobile-brand">
          <div className="login-brand-logo">
            <img src={brand.mark} alt="" />
            <span>{brand.name}</span>
          </div>
          <span>{brand.tagline}</span>
        </div>
        <section className="login-content" aria-labelledby="login-title">
          {children}
        </section>
        <a href={brand.makerUrl} target="_blank" rel="noopener" className="login-maker">
          Un producto de <img src={doscientosLogo} alt={brand.maker} />
        </a>
      </div>
    </main>
  )
}
