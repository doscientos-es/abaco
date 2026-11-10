/** Application boundary for the client passport. Queries and commands remain tenant-scoped. */
export {
  createContact,
  createLocation,
  loadClientPassport,
  updateContact,
  updateLocation,
} from '../infrastructure/client-passport-repository'
export type { ClientPassport } from '../infrastructure/client-passport-repository'
