# Ábaco — enfoque comercial y validación

Actualizado el 20 de noviembre de 2026. Documento de trabajo: las hipótesis no son resultados medidos.
Esta fecha corresponde a la última revisión comercial registrada, no verifica que precios,
mercado o piloto sigan vigentes. Antes de usarlo externamente, confirmar la oferta en código
y contrastar las fuentes de mercado y el avance comercial.

## 1. Cliente inicial y propuesta

- Prioridad: autónomos y pequeñas empresas de instalaciones con presupuestos frecuentes.
- Primer piloto: escoger un solo oficio entre electricidad y fontanería/climatización, y una zona accesible de Cataluña.
- Perfil: el propietario prepara presupuestos y persigue respuestas o cobros con documentos y mensajes dispersos.
- No abrir productos separados por oficio ni ampliar el alcance antes de validar este flujo.
- Mensaje: **prepara presupuestos, facilita la respuesta de tu cliente y controla lo pendiente de cobrar**.

El primer resultado útil es enviar un presupuesto real. La siguiente señal de valor es obtener una respuesta del cliente y seguir la facturación y los cobros.

### Lo que se puede ofrecer hoy

- Clientes y catálogo de materiales y mano de obra.
- Presupuestos y facturas; envío por WhatsApp y correo.
- Enlace para que el cliente acepte o rechace el presupuesto, con nombre y fecha registrados.
- Seguimiento de facturas y cobros pendientes; contabilidad básica.

La aceptación registrada no se presenta como firma electrónica certificada. No prometer cobro automático de anticipos, resultados garantizados, integraciones o gestión integral de obras sin validar el flujo completo. Redsys tramita la suscripción de Ábaco: no demuestra un sistema de cobro de los trabajos del instalador.

## 2. Oferta vigente

Una cuota base incluye el núcleo y una persona. Cada plaza adicional cuesta 8 €/mes, tanto con pago mensual como anual. Las plazas cubren a las personas con acceso, incluida la persona administradora y las invitaciones pendientes; los trabajadores registrados sin acceso no ocupan plaza. Los importes son sin IVA.

| Concepto                   | Pago mensual |                        Pago anual |
| -------------------------- | -----------: | --------------------------------: |
| Cuota base con una persona |  34,80 €/mes | 348 €/año, equivalente a 29 €/mes |
| Cada persona adicional     |      8 €/mes |                          96 €/año |

Por ejemplo, tres personas cuestan 50,80 €/mes o 540 €/año (45 €/mes equivalentes), antes de módulos e IVA. El ahorro anual de dos mensualidades se aplica a la cuota base, no a las plazas adicionales. El catálogo vigente está en `billing_catalog`.

- El alta guiada nueva no tiene días de prueba. Tras elegir módulos y licencias, requiere confirmar la primera cuota y reservar la puesta en marcha. No se modifican las condiciones de empresas previas.
- El pago anual se cobra de una vez; su equivalente mensual no es una cuota mensual.
- Más de 200 personas o necesidades especiales: conversación y alcance evaluado, no una integración prometida.
- Los planes anteriores se mantienen para clientes existentes; no se cambian sus condiciones automáticamente. El paso a la nueva tarifa es voluntario y sus módulos incluidos deben contratarse aparte si se quieren conservar.

### Módulos opcionales

| Módulo                   | Mensual sin IVA | Anual sin IVA | Disponibilidad                                              |
| ------------------------ | --------------: | ------------: | ----------------------------------------------------------- |
| Trabajadores             |            +9 € |         +90 € | Opcional                                                    |
| Proveedores              |           +15 € |        +150 € | Opcional                                                    |
| Asistente de IA          |         +3,75 € |         +45 € | Una persona administradora; 500 peticiones incluidas al mes |
| MCP                      |            +9 € |         +90 € | Opcional                                                    |
| Logística de proveedores |           +29 € |        +290 € | No se ofrece ni se puede activar                            |

Los suplementos son fijos por empresa, no por plaza. Superadmin puede regalar módulos a una empresa; el acceso regalado no añade cargos. Los administradores pueden programar las altas y bajas de módulos de pago desde **Módulos opcionales**. El precio y el acceso cambian al confirmar el primer pago o la siguiente renovación, sin prorrateos ni borrado de datos. En empresas de cortesía, Superadmin cambia el acceso al momento y sin cobro. El módulo de Logística requiere validar quién pide el camión, cómo se confirma la entrega y qué canal usa cada proveedor.

En **Superadmin → empresa → Condiciones de facturación** se puede cambiar el plan, la capacidad, el periodo y el precio base sin IVA. Los módulos contratados se suman automáticamente; no se deben volver a incluir en el precio base pactado. Guardar no cobra ni cambia el historial. La tarifa de catálogo restaura el precio base del tramo y periodo elegidos.

En esa misma sección se puede configurar por empresa el IVA de la suscripción (21 % por defecto o 0 % cuando proceda). Cambiarlo no modifica el precio base pactado ni los justificantes de pagos anteriores; el nuevo tipo se aplica al próximo cobro.

## 3. Mercado: contexto, no previsión de ventas

El documento comercial estima 320.776 empresas en España y 55.512 con establecimientos en Cataluña para CNAE 412, 432, 433 y 439. Para instalaciones, estima 78.775 y 14.472 respectivamente.

Fuentes indicadas: [DIRCE / INE](https://www.ine.es/jaxiT3/Tabla.htm?t=73019) e [Idescat](https://www.idescat.cat/pub/?id=ee&n=20911), referencia a 1 de enero de 2025.

Estas cifras quedan pendientes de contrastar con las exportaciones seleccionadas. Cataluña mide empresas con establecimientos, no necesariamente con sede allí; explicitar ese criterio al comparar territorios. Personas físicas es una aproximación a autónomos y ya está incluida en el total de empresas: no sumar ambos colectivos.

El mercado inicial alcanzable debe contarse como negocios del oficio y zona elegidos, accesibles por el canal comercial y con el problema descrito. Un porcentaje pequeño del mercado total no valida conversión, precio ni rentabilidad.

## 4. Ticket y sostenibilidad

MRR significa ingreso recurrente mensual normalizado, sin IVA. Una suscripción anual aporta su precio anual dividido entre 12, no todo el cobro al MRR del mes.

**Ticket medio = MRR / empresas con suscripción de pago activa.** Excluir pruebas gratuitas; distinguir descuentos, impagos y cobros de suscripciones.

El ticket depende de las plazas, los módulos y el periodo contratados. Una empresa con una persona aporta 34,80 € de MRR con pago mensual o 29 € con pago anual; cada plaza adicional aporta 8 € de MRR. Los módulos anuales se dividen entre 12. La composición de la cartera es una hipótesis hasta disponer de datos reales.

**Contribución por cliente = ticket − costes variables por cliente.** Incluir comisiones de pago y comerciales recurrentes, soporte e infraestructura de uso, sin duplicar partidas ya incluidas en los costes fijos.

**Clientes de equilibrio = redondear hacia arriba(costes fijos / contribución por cliente).**

Escenarios ilustrativos con 2.400 € de costes fijos y un margen de contribución supuesto del 80 %:

| Ticket sin IVA | Contribución por cliente | Clientes de equilibrio | Clientes para 10.000 € de MRR |
| -------------: | -----------------------: | ---------------------: | ----------------------------: |
|           21 € |                  16,80 € |                    143 |                           477 |
|        25,20 € |                  20,16 € |                    120 |                           397 |
|           30 € |                     24 € |                    100 |                           334 |
|           40 € |                     32 € |                     75 |                           250 |

El margen del 80 % es un ejemplo, no una medición. Recalcular con costes empresariales reales de las dos retribuciones y con el presupuesto de captación. Una adquisición inicial no incluida en los costes fijos necesita financiación adicional.

120 clientes no constituyen por sí solos un objetivo prudente: a 21 € aportan 2.016 € tras el margen supuesto, por debajo de los 2.400 €. Separar equilibrio, colchón de caja y objetivo de crecimiento. El IVA cobrado no es ingreso disponible.

## 5. Piloto comercial y decisiones

1. Entrevistar a 15–20 negocios de un solo oficio: frecuencia de presupuestos, herramientas actuales, tiempo perdido, cobros pendientes y motivo para cambiar.
2. Conseguir 10 empresas que paguen la tarifa actual. Las entrevistas y pruebas gratuitas no cuentan como validación de precio.
3. Acompañar el primer presupuesto real y anotar el tiempo de puesta en marcha y soporte.
4. Revisar uso y retención a los 60 y 90 días: envío real, respuesta del cliente, repetición y motivos de abandono.
5. Repetir la captación por un canal antes de ampliar oficios, añadir planes o desarrollar otro producto.

Estos hitos son aprendizaje inicial, no prueba estadística de viabilidad. No cambiar tarifas ni escalar gasto comercial automáticamente por alcanzarlos.

### Registro semanal en el CRM

Registrar por empresa y cohorte: oficio y zona, canal, fecha de contacto, cualificación, demo, alta abonada, cita reservada, primer presupuesto real enviado, primera respuesta, primer pago, plan y periodo, baja y motivo. Registrar también gasto de canal y minutos comerciales, de onboarding y soporte. No guardar enlaces públicos de clientes ni credenciales.

| Indicador                  | Definición para decidir                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Conversión comercial       | Nuevas empresas de pago / oportunidades cualificadas de la misma cohorte               |
| Activación                 | Empresas de la cohorte que envían un presupuesto real / empresas que completan el alta |
| Ticket observado           | MRR sin IVA / empresas de pago activas, desglosado por plan y periodo                  |
| Coste de adquisición (CAC) | Gasto de captación y coste del tiempo comercial / nuevas empresas de pago              |
| Recuperación del CAC       | CAC / contribución mensual media; aproximación que no garantiza retención              |
| Retención a 60/90 días     | Empresas de pago de la cohorte que siguen suscritas; revisar uso por separado          |
| Soporte                    | Minutos por empresa, separando puesta en marcha y atención recurrente                  |

La permanencia contractual de una suscripción anual no demuestra uso ni renovación. Separar bajas mensuales, cancelación de renovación anual y renovaciones efectivas. Revisar también impagos.

Ejemplo, no objetivo: con 334 clientes y un 3 % de bajas mensuales se pierden unos 10 al mes. Crecer en 20 netos exigiría unas 30 altas; con conversión del 10 %, unas 300 oportunidades cualificadas mensuales.

El registro es manual en el CRM durante el piloto: este documento no implica telemetría automática nueva. Revisar cada semana con el comercial; priorizar el problema que bloquea la activación o la retención, no el número de funciones.

## 6. Regla para otros productos

Comparar clientes realmente accesibles, urgencia y frecuencia del problema, pagos demostrados, contribución, CAC, retención y soporte. No priorizar solo por el tamaño del mercado. Mantener una oferta y un canal enfocados hasta demostrar que se pueden repetir económicamente.
