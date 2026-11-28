import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'

import {
  monthlyClientReportDisclaimer,
  monthlyClientReportPeriod,
  monthlyExtraStatuses,
  monthlyReportDateLabel,
  monthlyReportExtraQuantity,
  monthlyReportMonthLabel,
  monthlyVisitStatuses,
  summarizeMonthlyClientReport,
  type MonthlyReportDisplay,
} from '../domain/monthly-client-report'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 56,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
    color: '#17201b',
  },
  eyebrow: { color: '#385447', fontSize: 9, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  summary: { backgroundColor: '#eff5ef', padding: 10, marginTop: 12, marginBottom: 8 },
  note: { color: '#45534b', fontSize: 9, marginTop: 4 },
  section: { fontSize: 14, fontWeight: 'bold', marginTop: 14, marginBottom: 7 },
  row: { borderBottomWidth: 0.6, borderBottomColor: '#dedfe0', paddingVertical: 5 },
  rowTitle: { fontWeight: 'bold' },
  footer: {
    color: '#45534b',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#dedfe0',
    paddingTop: 5,
    marginTop: 14,
  },
})

export function MonthlyClientReportDocument({ report }: { report: MonthlyReportDisplay }) {
  const totals = summarizeMonthlyClientReport(report)
  return (
    <Document title="Informe mensual de servicios">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>MENOS LÍOS · SERVICIOS</Text>
        <Text style={styles.title}>Informe mensual de servicios</Text>
        <Text>Cliente: {report.clientName}</Text>
        <Text>Centro: {report.centreName}</Text>
        <Text>Periodo: {monthlyReportMonthLabel(report.month)}</Text>
        <View style={styles.summary} wrap={false}>
          <Text>
            Visitas realizadas: {totals.completed} · Pendientes o en curso: {totals.pending}
          </Text>
          <Text>
            Canceladas u omitidas: {totals.canceledOrSkipped} · Extras: {totals.extras}
          </Text>
        </View>
        <Text style={styles.note}>{monthlyClientReportPeriod}</Text>
        <Text style={styles.note}>{monthlyClientReportDisclaimer}</Text>
        <Text style={styles.section} minPresenceAhead={32}>
          Visitas del periodo
        </Text>
        {!report.visits.length ? <Text>No hay visitas en este periodo.</Text> : null}
        {report.visits.map((visit) => (
          <View key={visit.id} style={styles.row} wrap={false}>
            <Text style={styles.rowTitle}>{visit.title}</Text>
            <Text>
              {monthlyReportDateLabel(visit.date)} · {visit.centre} ·{' '}
              {monthlyVisitStatuses[visit.status]}
            </Text>
          </View>
        ))}
        <Text style={styles.section} minPresenceAhead={32}>
          Extras propuestos en el periodo
        </Text>
        {!report.extras.length ? <Text>No hay extras propuestos en este periodo.</Text> : null}
        {report.extras.map((extra) => (
          <View key={extra.id} style={styles.row} wrap={false}>
            <Text style={styles.rowTitle}>{extra.title}</Text>
            <Text>
              {monthlyReportDateLabel(extra.date)} · {extra.centre} ·{' '}
              {monthlyReportExtraQuantity(extra)} · {monthlyExtraStatuses[extra.status]}
            </Text>
          </View>
        ))}
        <Text style={styles.footer}>
          Menos Líos · Fin del informe operativo · No es una factura
        </Text>
      </Page>
    </Document>
  )
}

export async function downloadMonthlyClientReport(
  report: MonthlyReportDisplay,
  signal: AbortSignal,
) {
  const blob = await pdf(<MonthlyClientReportDocument report={report} />).toBlob()
  if (signal.aborted) return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `informe-servicios-${report.month}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
