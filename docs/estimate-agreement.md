# Datos acordados de un presupuesto

El texto redactado es solo presentación. Nunca se extraen importes, periodicidades
o servicios analizando ese texto.

- En borrador, las fuentes de verdad siguen siendo `estimate_lines` (céntimos,
  cantidades y descuentos), `contract_billing_frequency` y las filas tipadas
  `work_table` de `document_sections` (identificador, tarea, frecuencia y notas).
- Al publicar, `estimate_publications.snapshot.agreement` conserva una copia
  estructurada e inmutable con `version: 1`, moneda EUR, presupuesto de origen,
  precio neto, IVA, total y servicios en el orden acordado.
- Los contratos y las órdenes de trabajo conservan esa copia en `source_snapshot`.
  Los contratos por secciones crean trabajos desde los servicios, no desde la
  partida que representa el precio global. Cada trabajo mantiene los identificadores
  de su sección y servicio de origen.
- Las nuevas facturas guardan `document_snapshot.estimateAgreement` y el modelo
  de aplicación lo valida y conserva. Es el acuerdo completo: **no sustituye el
  importe de la factura**, que puede corresponder a un hito o periodo parcial.
- La periodicidad del precio y la frecuencia de ejecución de un servicio son
  independientes. La frecuencia de servicio se conserva literalmente: no genera
  calendarios hasta configurar explícitamente el trabajo.
- Los documentos históricos no se reescriben. Si no tienen `agreement`, las
  conversiones compatibles lo derivan de su copia estructurada original,
  nunca de datos actuales ni del texto renderizado.

La generación y captura se centraliza en
`app_private.estimate_agreement_metadata(jsonb)`. Un cambio incompatible en este
formato requiere una nueva versión y su correspondiente lector.
