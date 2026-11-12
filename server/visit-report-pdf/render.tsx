import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'

import type { ReportProjection } from './projection'
import { MAX_PHOTO_BYTES } from './upstream'

const styles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 55,
    paddingHorizontal: 43,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#171717',
  },
  header: { fontSize: 22, color: '#2a4227', marginVertical: 8 },
  muted: { color: '#626862', fontSize: 8, marginBottom: 4 },
  facts: { backgroundColor: '#f2f5ef', padding: 11, marginVertical: 8 },
  fact: { flexDirection: 'row', marginBottom: 5 },
  factLabel: { width: 90, color: '#626862' },
  factValue: { flex: 1 },
  heading: { fontSize: 12, color: '#2a4227', marginTop: 15, marginBottom: 7 },
  paragraph: { marginBottom: 5, lineHeight: 1.5 },
  image: { width: '100%', height: 300, objectFit: 'contain' },
  caption: { textAlign: 'center', marginVertical: 6 },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 43,
    right: 43,
    borderTopWidth: 1,
    borderTopColor: '#dfe4dc',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#626862',
    fontSize: 7,
  },
})

const assessments: Record<string, string> = {
  below: 'Por debajo del rango',
  within: 'Dentro del rango',
  above: 'Por encima del rango',
  unconfigured: 'Sin rango configurado',
}
const activities: Record<string, string> = {
  labor: 'Tiempo',
  travel: 'Desplazamiento',
  material: 'Material',
  spare: 'Repuesto',
  product: 'Producto',
  corrective_action: 'Acción correctora',
}
const phases: Record<string, string> = { before: 'Antes', after: 'Después', other: 'Evidencia' }

function date(value: string) {
  const parsed = new Date(value)
  if (!value || Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

async function preparePhoto(data: Buffer) {
  if (data.length > MAX_PHOTO_BYTES) throw new Error('Photo exceeds the allowed size')
  for (const edge of [1400, 1200, 1000, 850, 700]) {
    for (const quality of [78, 68, 58]) {
      const result = await sharp(data, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (result.length <= 800_000) return result
    }
  }
  throw new Error('Photo could not be prepared for the PDF')
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.heading} minPresenceAhead={30}>
        {title}
      </Text>
      {children}
    </View>
  )
}

export async function renderVisitReport(report: ReportProjection, photoBytes: Buffer[]) {
  if (
    !Array.isArray(report.photos) ||
    report.photos.length !== photoBytes.length ||
    photoBytes.length > 20
  ) {
    throw new Error('Photo count does not match report')
  }
  const images: Buffer[] = []
  for (let i = 0; i < photoBytes.length; i += 4) {
    images.push(...(await Promise.all(photoBytes.slice(i, i + 4).map(preparePhoto))))
  }
  const facts = [
    ['Cliente', report.client.name],
    ['Intervención', report.visit.title],
    ['Ubicación', [report.location?.name, report.location?.address].filter(Boolean).join(' · ')],
    ['Instalación', report.asset?.name],
    ['Inicio', date(report.visit.actualStartAt)],
    ['Fin', date(report.visit.actualEndAt)],
  ]
  return renderToBuffer(
    <Document title="Parte de visita" author={report.company.name}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.muted}>{report.company.name || 'Empresa'}</Text>
        <Text style={styles.header}>Parte de visita</Text>
        <Text style={styles.muted}>
          Versión {report.version} · Cerrado el {date(report.closedAt)}
        </Text>
        <View style={styles.facts}>
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <View style={styles.fact} key={label}>
                <Text style={styles.factLabel}>{label}</Text>
                <Text style={styles.factValue}>{value}</Text>
              </View>
            ))}
        </View>
        <Section title="Resumen">
          <Text style={styles.paragraph}>
            {report.report.notes || 'Sin notas de intervención.'}
          </Text>
        </Section>
        {report.report.checklist.length ? (
          <Section title="Comprobaciones">
            {report.report.checklist.map((item, i) => (
              <Text style={styles.paragraph} key={i}>
                {item.done ? 'Hecha' : 'Pendiente'} · {item.label}
              </Text>
            ))}
          </Section>
        ) : null}
        {report.measurements.length ? (
          <Section title="Mediciones">
            {report.measurements.map((item, i) => (
              <Text style={styles.paragraph} key={i}>
                {item.label}: {item.value ?? '-'} {item.unit}
                {item.assessment ? ` · ${assessments[item.assessment] ?? item.assessment}` : ''}
              </Text>
            ))}
          </Section>
        ) : null}
        {report.activities.length ? (
          <Section title="Trabajos realizados">
            {report.activities.map((item, i) => (
              <Text style={styles.paragraph} key={i}>
                {activities[item.kind] ?? item.kind}: {item.description}
                {item.quantity !== null ? ` · ${item.quantity} ${item.unit}` : ''}
              </Text>
            ))}
          </Section>
        ) : null}
        {report.incidents.length ? (
          <Section title="Incidencias">
            {report.incidents.map((item, i) => (
              <Text style={styles.paragraph} key={i}>
                {item.title}
                {item.resolution ? ` · ${item.resolution}` : ''}
              </Text>
            ))}
          </Section>
        ) : null}
        {images.length ? (
          <Section title="Fotografías">
            {images.map((image, i) => (
              <View key={i} wrap={false}>
                <Image src={image} style={styles.image} />
                <Text style={styles.caption}>
                  {phases[report.photos[i]?.phase ?? ''] ?? 'Evidencia'} ·{' '}
                  {report.photos[i]?.caption}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}
        {report.report.recommendations ? (
          <Section title="Recomendaciones">
            <Text style={styles.paragraph}>{report.report.recommendations}</Text>
          </Section>
        ) : null}
        {report.report.nextActions ? (
          <Section title="Próximas actuaciones">
            <Text style={styles.paragraph}>{report.report.nextActions}</Text>
          </Section>
        ) : null}
        <Text style={styles.muted}>
          Informe de la visita cerrada. Para aclaraciones, contacta con {report.company.name}.
        </Text>
        <View style={styles.footer} fixed>
          <Text>Parte de visita · Versión cerrada</Text>
          <Text render={({ pageNumber }) => `Página ${pageNumber}`} />
        </View>
      </Page>
    </Document>,
  )
}
