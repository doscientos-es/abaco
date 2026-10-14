import changelog from '@/shared/lib/changelog.json'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

type Release = {
  version: string | null
  date: string
  title: string
  sections: { title: string; items: string[] }[]
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' })

export function ChangelogSection({ releases = changelog.releases }: { releases?: Release[] } = {}) {
  const pager = usePagination(releases, 'changelog', 5)

  return (
    <section aria-labelledby="changelog-heading" className="space-y-6">
      <div className="space-y-1">
        <h2 id="changelog-heading" className="text-lg font-semibold">
          Novedades
        </h2>
        <p className="text-muted-foreground text-sm">Las nuevas funciones, mejoras y correcciones de Ábaco.</p>
      </div>
      {pager.total ? (
        <>
          <ol aria-label="Historial de novedades" className="space-y-6">
            {pager.pageItems.map((release) => (
              <li key={`${release.date}-${release.title}`}>
                <article className="border-border space-y-4 border-t pt-5">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{release.title}</h3>
                    <time dateTime={release.date} className="text-muted-foreground text-xs">
                      {dateFormatter.format(new Date(`${release.date}T00:00:00Z`))}
                    </time>
                  </header>
                  <div className="space-y-4">
                    {release.sections.map((section) => (
                      <section key={section.title} aria-label={section.title} className="space-y-2">
                        <h4 className="text-sm font-medium">{section.title}</h4>
                        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                          {section.items.map((item, index) => (
                            <li key={`${index}-${item}`} className="break-words">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </article>
              </li>
            ))}
          </ol>
          <TablePagination controller={pager} noun="entradas" />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Pronto compartiremos novedades.</p>
      )}
    </section>
  )
}
