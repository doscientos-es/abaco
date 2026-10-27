# Ábaco — enfoque comercial y validación

Actualizado el 15 de octubre de 2026. Documento de trabajo: las hipótesis no son resultados medidos.

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

## 2. Oferta actual, no una nueva tarifa

La fuente de verdad de la presentación es `src/features/billing/domain/plans.ts`. Los precios y límites también se aplican en la base de datos; un cambio de tarifa exige coordinar ambos lados y comprobar el cobro.

| Plan     | Personas, incluido el propietario | Mensual sin IVA | Anual sin IVA | Equivalente mensual anual |
| -------- | --------------------------------: | --------------: | ------------: | ------------------------: |
| Autónomo |                                 1 |            20 € |         200 € |                   16,67 € |
| Equipo   |                           Hasta 5 |            34 € |         340 € |                   28,33 € |
| Empresa  |                          Hasta 15 |            54 € |         540 € |                      45 € |

Todos incluyen las mismas funciones. Recomendar el plan más pequeño que admita al equipo real; no restringir artificialmente la aceptación o el seguimiento de cobros para forzar una subida.

- Prueba: 14 días, hasta 15 personas, sin tarjeta ni cobro automático al terminar.
- El pago anual se cobra de una vez; su equivalente mensual no es una cuota mensual.
- Más de 15 personas o necesidades especiales: conversación y alcance evaluado, no una integración prometida.
- Esencial, Pro, Equipo a 79 €, Empresa a 149 € y Operaciones a 249 € son propuestas del documento comercial, **no planes vigentes**. No anunciarlos ni utilizarlos para prever ingresos actuales.
- No introducir una entrada a 9 € ni cinco niveles sin evidencia de autoservicio, costes de soporte y disposición a pagar.

## 3. Mercado: contexto, no previsión de ventas

El documento comercial estima 320.776 empresas en España y 55.512 con establecimientos en Cataluña para CNAE 412, 432, 433 y 439. Para instalaciones, estima 78.775 y 14.472 respectivamente.

Fuentes indicadas: [DIRCE / INE](https://www.ine.es/jaxiT3/Tabla.htm?t=73019) e [Idescat](https://www.idescat.cat/pub/?id=ee&n=20911), referencia a 1 de enero de 2025.

Estas cifras quedan pendientes de contrastar con las exportaciones seleccionadas. Cataluña mide empresas con establecimientos, no necesariamente con sede allí; explicitar ese criterio al comparar territorios. Personas físicas es una aproximación a autónomos y ya está incluida en el total de empresas: no sumar ambos colectivos.

El mercado inicial alcanzable debe contarse como negocios del oficio y zona elegidos, accesibles por el canal comercial y con el problema descrito. Un porcentaje pequeño del mercado total no valida conversión, precio ni rentabilidad.

## 4. Ticket y sostenibilidad

MRR significa ingreso recurrente mensual normalizado, sin IVA. Una suscripción anual aporta su precio anual dividido entre 12, no todo el cobro al MRR del mes.

**Ticket medio = MRR / empresas con suscripción de pago activa.** Excluir pruebas gratuitas; distinguir descuentos, impagos y cobros de suscripciones.

Ejemplo no observado: 70 % Autónomo, 25 % Equipo y 5 % Empresa.

- Si todos pagan mensualmente: ticket de **25,20 €**.
- Si todos pagan anualmente: ticket de **21 €**, calculado con precios anuales exactos antes de redondear.
- Una cartera mixta exige calcular cada plan y periodo por separado.
- 30 € es una hipótesis a validar, no un ticket conservador demostrado; 35–45 € es una aspiración, no una previsión.

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

Registrar por empresa y cohorte: oficio y zona, canal, fecha de contacto, cualificación, demo, inicio de prueba, primer presupuesto real enviado, primera respuesta, primer pago, plan y periodo, baja y motivo. Registrar también gasto de canal y minutos comerciales, de onboarding y soporte. No guardar enlaces públicos de clientes ni credenciales.

| Indicador                  | Definición para decidir                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Conversión comercial       | Nuevas empresas de pago / oportunidades cualificadas de la misma cohorte                |
| Activación                 | Empresas de la cohorte que envían un presupuesto real / empresas que empiezan la prueba |
| Ticket observado           | MRR sin IVA / empresas de pago activas, desglosado por plan y periodo                   |
| Coste de adquisición (CAC) | Gasto de captación y coste del tiempo comercial / nuevas empresas de pago               |
| Recuperación del CAC       | CAC / contribución mensual media; aproximación que no garantiza retención               |
| Retención a 60/90 días     | Empresas de pago de la cohorte que siguen suscritas; revisar uso por separado           |
| Soporte                    | Minutos por empresa, separando puesta en marcha y atención recurrente                   |

La permanencia contractual de una suscripción anual no demuestra uso ni renovación. Separar bajas mensuales, cancelación de renovación anual y renovaciones efectivas. Revisar también impagos.

Ejemplo, no objetivo: con 334 clientes y un 3 % de bajas mensuales se pierden unos 10 al mes. Crecer en 20 netos exigiría unas 30 altas; con conversión del 10 %, unas 300 oportunidades cualificadas mensuales.

El registro es manual en el CRM durante el piloto: este documento no implica telemetría automática nueva. Revisar cada semana con el comercial; priorizar el problema que bloquea la activación o la retención, no el número de funciones.

## 6. Regla para otros productos

Comparar clientes realmente accesibles, urgencia y frecuencia del problema, pagos demostrados, contribución, CAC, retención y soporte. No priorizar solo por el tamaño del mercado. Mantener una oferta y un canal enfocados hasta demostrar que se pueden repetir económicamente.