import { listTechnicians } from '@/features/visits/application/visit-actions'
import { workTeamActions } from '@/features/work-teams/application/work-team-actions'

import type { ContractSignatureSetup } from '../domain/contract-task-assignment'
import { loadContractAssignmentSetup } from '../infrastructure/contract-signature-repository'

export {
  recordContractSignature,
  signedContractDocumentUrl,
} from '../infrastructure/contract-signature-repository'

export async function loadContractSignatureSetup(
  tenantId: string,
  contractId: string,
): Promise<ContractSignatureSetup> {
  const [setup, people, teams] = await Promise.all([
    loadContractAssignmentSetup(tenantId, contractId),
    listTechnicians(tenantId),
    workTeamActions.list(tenantId),
  ])
  return { ...setup, people, teams: teams.filter((team) => !team.archived) }
}
