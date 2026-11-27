/** Prefer the new name while existing deployments still use the legacy prefix. */
export function renamedEnv(name: string): string | undefined {
  return Deno.env.get(`MENOSLIOS_${name}`) || Deno.env.get(`ABACO_${name}`)
}
