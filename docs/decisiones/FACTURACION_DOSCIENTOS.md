# Facturas de suscripción de Doscientos

DEV-42 prepara la emisión desde Ábaco, con una serie distinta de la del
backoffice. Las facturas son de Doscientos a cada empresa; no son facturas
emitidas por esas empresas a sus clientes.

## Modalidad fiscal

La preferencia actual es **NO VERI\*FACTU**: no enviar automáticamente los
registros a la AEAT. Esto no elimina los requisitos del sistema de facturación.
La modalidad exige, entre otros, registros encadenados y firmados, registro de
eventos, controles y conservación. La factura debe incluir el QR tributario.
La revisión fiscal y técnica es necesaria antes de activar la emisión.

La firma del módulo compartido no debe considerarse validada para este uso sin
pruebas independientes de interoperabilidad y cumplimiento. La librería por sí
sola no implementa todo el sistema exigido para la modalidad sin remisión.

En una comprobación independiente con un XML sintético, el resumen del documento
producido por `signXml` no coincidió con el calculado mediante la transformación
de canonicalización XML C14N 1.0 declarada por la propia firma. La implementación
actual calcula el resumen sobre los bytes originales, que no son necesariamente
canónicos. No debe utilizarse para emitir registros NO VERI\*FACTU hasta corregirla
y verificar las firmas completas y los ejemplos oficiales de la AEAT.

## Corte entre sistemas

- Conservar el histórico y las cadenas del backoffice sin reemitir facturas.
- Asignar cada pago a un único sistema de emisión mediante una decisión durable
  y atómica, antes de que cualquiera de los dos pueda emitirlo.
- Mantener los pagos ya entregados al backoffice en ese sistema, incluso ante
  reintentos, respuestas perdidas o trabajos todavía en curso.
- Conciliar los pagos pendientes antes del corte; nunca reenviar un pago al
  nuevo emisor solo porque haya expirado el bloqueo temporal del anterior.
- Mantener una secuencia correlativa por serie y la cadena por sistema y
  obligado tributario, no por serie. Confirmar con asesoría la independencia de
  ambos sistemas y sus series, incluidas las rectificativas.

## Pendiente antes de usarlo

Implementar la emisión transaccional y su registro fiscal firmado, el registro
de eventos, comprobaciones de integridad, rectificativas, conservación,
consulta, envío, conciliación y exportación. Sustituir la comprobación fiscal
que actualmente hace backoffice y probar el corte sin duplicados. Verificar los
requisitos de factura electrónica B2B y la declaración responsable aplicables.

El código de preparación de borradores valida datos y cálculos: **no emite ni
numera facturas**, y no cambia el circuito de cobro ni el backoffice.
El PR prepara la pantalla para que el superadmin guarde en Ábaco la identidad
fiscal y las series previstas de Doscientos. La configuración tiene control de
acceso, revisión y auditoría, pero aún no la consume ningún emisor ni activa el
cambio de sistema. Las migraciones de configuración se han aplicado en Supabase;
la interfaz aún depende del despliegue de este PR.

## Exportación para gestoría

La preparación del CSV selecciona por fecha de emisión el último trimestre
natural cerrado en horario peninsular, conserva los importes fiscales y
distingue las rectificativas. Requiere datos de facturas emitidas, no cobros ni
perfiles editables. Todavía no está conectada a ninguna fuente ni a la pantalla;
no incluye los documentos PDF. El listado actual solo conoce la fecha de cobro
y el enlace o número comunicado por backoffice, por lo que no permite construir
un registro fiscal trimestral completo ni garantiza incluir todas las facturas.

Fuentes: [modalidades AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/modalidades-cumplimiento-obligaciones.html),
[plazos AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html)
y [RD 1007/2023](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840).
