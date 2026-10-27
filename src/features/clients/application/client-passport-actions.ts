/** Application boundary for the client passport. Queries and commands remain tenant-scoped. */
export {
  createContact,
  createEquipment,
  createLocation,
  createPool,
  loadClientPassport,
  replaceEquipment,
  setAssetStatus,
  setEquipmentStatus,
  transferEquipment,
  updateContact,
  updateEquipment,
  updateLocation,
  updatePool,
} from '../infrastructure/client-passport-repository'
export type { ClientPassport } from '../infrastructure/client-passport-repository'
