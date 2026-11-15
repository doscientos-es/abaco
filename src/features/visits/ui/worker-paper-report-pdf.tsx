import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'

import type { MyDayTask } from '../application/my-day-tasks'
import type { PaperSnapshot } from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.4 },
  title: { fontSize: 18, marginBottom: 14 },
  section: { fontSize: 12, marginTop: 18, marginBottom: 6 },
  task: { marginBottom: 8 },
  note: { fontSize: 9, color: '#555555' },
  line: { borderBottomWidth: 1, borderBottomColor: '#aaaaaa', height: 26 },
  signature: { borderWidth: 1, borderColor: '#aaaaaa', height: 100, padding: 8, marginTop: 8 },
})

export function WorkerPaperReportDocument({
  visit,
  snapshot,
  tasks,
}: {
  visit: VisitSummary
  snapshot: PaperSnapshot
  tasks: MyDayTask[]
}) {
  const date = new Date(visit.scheduled_start_at).toLocaleDateString('es-ES', {
    timeZone: visit.timezone,
  })
  return (
    <Document title="Parte de trabajo para firma manual">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>Parte de trabajo</Text>
        <Text>Visita: {visit.id}</Text>
        <Text>Fecha prevista: {date}</Text>
        <Text>Cliente: {snapshot.client || visit.client_name}</Text>
        <Text>Centro: {snapshot.center || visit.location_name}</Text>
        <Text>Dirección: {snapshot.address || visit.address}</Text>
        <Text>Servicio: {visit.title}</Text>
        <Text style={styles.section}>Trabajos realizados</Text>
        <Text style={styles.note}>
          Los trabajos indicados se consideran realizados, salvo las incidencias anotadas a
          continuación.
        </Text>
        {snapshot.tasks ? <Text style={styles.task}>{snapshot.tasks}</Text> : null}
        {snapshot.scheduledTasks?.map((task, index) => (
          <Text key={`${index}:${task.title}`} style={styles.task}>
            {task.title}
          </Text>
        ))}
        {tasks.map((task) => (
          <View key={task.id} style={styles.task} wrap={false}>
            <Text>{task.title}</Text>
            {task.notes ? <Text>{task.notes}</Text> : null}
            {task.checklist.map((item) => (
              <Text key={item.id}>- {item.label}</Text>
            ))}
          </View>
        ))}
        {!snapshot.tasks && !snapshot.scheduledTasks?.length && !tasks.length ? (
          <Text>{visit.title}</Text>
        ) : null}
        {snapshot.instructions ? (
          <View>
            <Text style={styles.section}>Acceso e instrucciones</Text>
            <Text>{snapshot.instructions}</Text>
          </View>
        ) : null}
        <Text style={styles.section}>Observaciones e incidencias</Text>
        <View style={styles.line} />
        <View style={styles.line} />
        <View style={styles.line} />
        <View wrap={false}>
          <Text style={styles.section}>Conformidad del cliente</Text>
          <Text>Fecha de realización: ______________________________</Text>
          <Text>Nombre del cliente: _________________________________</Text>
          <View style={styles.signature}>
            <Text>Firma y sello</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function downloadWorkerPaperReport(
  visit: VisitSummary,
  snapshot: PaperSnapshot,
  tasks: MyDayTask[],
) {
  const blob = await pdf(
    <WorkerPaperReportDocument visit={visit} snapshot={snapshot} tasks={tasks} />,
  ).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `parte-${visit.id}.pdf`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
