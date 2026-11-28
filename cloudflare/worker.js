import { createServer } from 'node:http'

import { handleAsNodeRequest } from 'cloudflare:node'

import aiChat from '../api/ai_chat'
import aiSuggestion from '../api/ai_suggestion'
import stripeAuthorize from '../api/stripe_connect_authorize'
import stripeCallback from '../api/stripe_connect_callback'
import stripeWebhook from '../api/stripe_connect_webhook'
import reportPdf from '../api/visit_report_pdf'
import reportPdfWorker from '../api/visit_report_pdf_worker'
import { interventionIntake } from './intervention-intake.js'
import { publicPricing } from './public-pricing.js'

const handlers = {
  '/api/ai_chat': aiChat,
  '/api/ai_suggestion': aiSuggestion,
  '/api/stripe_connect_authorize': stripeAuthorize,
  '/api/stripe_connect_callback': stripeCallback,
  '/api/stripe_connect_webhook': stripeWebhook,
  '/api/visit_report_pdf': reportPdf,
  '/api/visit_report_pdf_worker': reportPdfWorker,
}
const server = createServer((request, response) => {
  const path = new URL(request.url, 'https://worker.invalid').pathname
  const handler = Object.hasOwn(handlers, path) ? handlers[path] : undefined
  if (!handler) {
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{"error":"not_found"}')
    return
  }
  Promise.resolve(handler(request, response)).catch(() => {
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end('{"error":"unavailable"}')
  })
})
server.listen(8080)
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/intervention-request/')) return interventionIntake(request, env)
    if (pathname === '/api/public-pricing') return publicPricing(request, env)
    if (pathname.startsWith('/api/')) return handleAsNodeRequest(8080, request)
    return env.ASSETS.fetch(request)
  },
}
