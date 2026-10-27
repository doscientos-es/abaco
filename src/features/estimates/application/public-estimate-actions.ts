import {
  callPublicEstimate,
  type PublicAction,
  type PublicEstimate,
  type PublicResult,
} from '../infrastructure/public-estimate-api'

export type { PublicEstimate, PublicResult }

/** Loads the estimate behind a public link. */
export const loadPublicEstimate = (token: string): Promise<PublicResult> =>
  callPublicEstimate(token, 'view')

/** Records the client's answer. Accepting requires the client's name. */
export const respondToPublicEstimate = (
  token: string,
  action: Exclude<PublicAction, 'view'>,
  name: string,
): Promise<PublicResult> => callPublicEstimate(token, action, name)
