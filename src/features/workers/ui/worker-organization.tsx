import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { TeamMember } from '@/features/settings/application/team-actions'
import type { WorkTeam } from '@/features/work-teams'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { TextField } from '@/shared/ui/form'

export function WorkerOrganization({ people, teams }: { people: TeamMember[]; teams: WorkTeam[] }) {
  const [search, setSearch] = useState('')
  const active = teams.filter((team) => !team.archived)
  const grouped = new Set(active.flatMap((team) => team.memberIds))
  const unassigned = people.filter((person) => !grouped.has(person.userId))
  const matching = active.filter(
    (team) =>
      fuzzySearch(search, team.name) ||
      people.some(
        (person) =>
          team.memberIds.includes(person.userId) &&
          fuzzySearch(search, person.fullName, person.email),
      ),
  )
  return (
    <section className="space-y-5" aria-label="Organización de la empresa">
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="font-semibold">Toda la empresa · {people.length} personas</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Empresa → equipos → personas. Una persona puede pertenecer a varios equipos; esta vista no
          implica relaciones de mando.
        </p>
      </div>
      <TextField
        label="Buscar en el organigrama"
        value={search}
        onChange={setSearch}
        placeholder="Persona o equipo"
      />
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {matching.map((team) => {
          const members = people.filter((person) => team.memberIds.includes(person.userId))
          const matchingMembers = fuzzySearch(search, team.name)
            ? members
            : members.filter((person) => fuzzySearch(search, person.fullName, person.email))
          return (
            <article
              key={team.id}
              className="border-border bg-card space-y-3 rounded-xl border p-5"
            >
              <Link
                to="/trabajadores"
                search={{ equipo: team.id }}
                className="text-primary font-semibold hover:underline"
              >
                {team.name}
              </Link>
              <p className="text-muted-foreground text-sm">{members.length} personas</p>
              <ul className="border-border space-y-2 border-l pl-3">
                {matchingMembers.slice(0, 6).map((person) => (
                  <li key={person.userId}>
                    <Link
                      to="/trabajadores"
                      search={{ persona: person.userId }}
                      className="text-sm hover:underline"
                    >
                      {person.fullName || person.email}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to="/trabajadores"
                search={{ equipo: team.id }}
                className="text-primary block text-sm hover:underline"
              >
                Ver equipo{members.length > 6 ? ` y sus ${members.length} personas` : ''} →
              </Link>
            </article>
          )
        })}
      </div>
      {!matching.length ? (
        <p className="text-muted-foreground text-sm">
          No hay equipos que coincidan. Crea equipos desde la pestaña Equipos.
        </p>
      ) : null}
      {unassigned.length ? (
        <details
          className="border-border rounded-xl border p-5"
          open={search.trim() ? true : undefined}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Sin equipo · {unassigned.length} personas
          </summary>
          <ul className="mt-4 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {unassigned
              .filter((person) => fuzzySearch(search, person.fullName, person.email))
              .map((person) => (
                <li key={person.userId}>
                  <Link
                    to="/trabajadores"
                    search={{ persona: person.userId }}
                    className="text-primary text-sm hover:underline"
                  >
                    {person.fullName || person.email}
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
