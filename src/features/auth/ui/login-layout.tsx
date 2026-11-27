import type { ReactNode } from 'react'

import doscientosLogo from '@/shared/assets/logo.svg'
import { brand } from '@/shared/lib/brand'

import './login.css'

export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="login-layout">
      <aside className="login-brand-panel">
        <img src="/abaco-logo.svg" alt={brand.name} className="login-brand-logo" />
        <div className="login-brand-content">
          <h2>
            Tu negocio,
            <br />
            en orden.
          </h2>
          <p>{brand.promise}</p>
          <div className="login-abacus" aria-hidden="true">
            <div>
              <span />
              <span />
              <span />
            </div>
            <div>
              <span />
              <span />
              <span />
            </div>
            <div>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <p className="login-brand-tagline">{brand.tagline}</p>
      </aside>

      <div className="login-main">
        <div className="login-mobile-brand">
          <img src="/abaco-logo.svg" alt={brand.name} />
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
