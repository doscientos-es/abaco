import { createRoot } from 'react-dom/client'

import { portalTokenPattern } from '../domain/customer-portal'
import { CustomerPortalPage } from './customer-portal-page'

import './customer-portal-entry.css'

const root = document.getElementById('portal-root')
const hash = window.location.hash
const candidate = hash.startsWith('#token=') ? hash.slice(7) : ''
const token = portalTokenPattern.test(candidate) ? candidate : null
if (hash || window.location.search) history.replaceState(null, '', window.location.pathname)
if (root) createRoot(root).render(<CustomerPortalPage token={token} />)
