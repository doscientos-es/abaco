# Datos acordados de un presupuesto

El texto redactado es solo presentación. Nunca se extraen importes, periodicidades
o servicios analizando ese texto.

- En borrador, las fuentes de verdad son `estimate_lines` (céntimos, cantidades y
  descuentos), el importe con IVA `grossCents` opcional de la sección de precio,
  `contract_billing_frequency` y las filas de servicios de `document_sections`.
  El importe exacto se usa solo cuando corresponde a la partida y al IVA vigentes;
  los documentos anteriores siguen calculándose desde sus partidas.
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
- Las cuotas completas nuevas conservan su total exacto al crear el periodo. Los
  periodos existentes y los valorados manualmente no se modifican.
- La periodicidad del precio y la frecuencia de ejecución de un servicio son
  independientes. Las casillas de servicios se guardan en `periodicities` como
  códigos (`daily`, `twice_weekly`, `weekly`, `monthly`, `semiannual`, `annual`).
  Se permiten varias por tarea. El campo opcional mantiene compatibles las filas
  históricas: su `frequency` libre se conserva sin perder condiciones particulares.
  En el acuerdo, `frequency` resume las selecciones y conserva cualquier texto
  adicional; `periodicities` mantiene las casillas exactas. Ninguno de esos datos
  genera calendarios hasta configurar explícitamente el trabajo.
- Los documentos históricos no se reescriben. Si no tienen `agreement`, las
  conversiones compatibles lo derivan de su copia estructurada original,
  nunca de datos actuales ni del texto renderizado.

La generación y captura se centraliza en
`app_private.estimate_agreement_metadata(jsonb)`. Un cambio incompatible en este
formato requiere una nueva versión y su correspondiente lector.
