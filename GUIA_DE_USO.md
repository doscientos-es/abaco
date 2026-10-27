# Guía de uso de Ábaco

**Estado de esta guía:** 26 de octubre de 2026. Describe la aplicación presente en este repositorio. Algunas funciones recientes requieren aplicar y validar las migraciones de base de datos y configurar los servicios indicados al final antes de utilizarlas en un entorno real.

## 1. Entrar y elegir empresa

1. Entra con tu correo y contraseña. Si has recibido una invitación, complétala antes de acceder.
2. Si perteneces a varias empresas, elige la empresa activa desde el menú de usuario. Los datos y permisos cambian con esa selección.
3. En el mismo menú puedes abrir **Ajustes y equipo**, cambiar la contraseña o cerrar sesión.

La navegación principal se agrupa en **Resumen**, **Presupuestos**, **Clientes**, **Catálogo**, **Trabajos**, **Contratos**, **Agenda**, **Facturas**, **Contabilidad** y **Ajustes**. En móvil, las secciones adicionales aparecen en **Más**.

### Qué permite cada rol

| Rol                         | Uso principal                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Propietario y administrador | Gestión de empresa, equipo, costes, facturación, cobros y contabilidad.                                 |
| Editor                      | Clientes, catálogo, presupuestos y operaciones permitidas. No accede a costes internos ni contabilidad. |
| Solo lectura                | Consulta de clientes, catálogo, presupuestos y trabajos autorizados.                                    |
| Técnico                     | **Mi jornada** y las visitas que tenga asignadas, con los datos necesarios para realizarlas.            |

Si no ves una sección o una acción, puede deberse a tu rol o a que el plan de la empresa no permite esa escritura. Solicita a un administrador que revise el acceso; cambiar de empresa también cambia los permisos disponibles.

## 2. Preparar clientes e instalaciones

1. Abre **Clientes** y pulsa **Nuevo cliente**. Registra sus datos de contacto y facturación.
2. Abre la ficha del cliente para añadir **contactos** y **ubicaciones**.
3. En una ubicación puedes registrar la piscina y los equipos instalados. La ficha conserva cambios y sustituciones de equipos.
4. Antes de crear un cliente parecido, revisa los posibles duplicados que señale el formulario.

Los clientes se **archivan** para conservar sus referencias en presupuestos, trabajos y facturas. Archivar no equivale a borrar sus documentos históricos.

## 3. Crear y aceptar un presupuesto

1. En **Catálogo**, prepara los conceptos que uses con frecuencia.
2. En **Presupuestos**, pulsa **Crear presupuesto**, elige al cliente y añade partidas, importes, IVA y condiciones.
3. Configura los hitos de cobro si corresponde. Antes de publicar, selecciona si la aceptación dará lugar a un **trabajo** o a un **contrato recurrente**.
4. Revisa el documento y publica la propuesta. Puedes copiar el enlace o compartir la versión publicada por email o WhatsApp.
5. El cliente abre el enlace para aceptar o rechazar. La oficina también puede registrar una aceptación manual cuando conserve una referencia a la evidencia externa.

Una aceptación manual queda identificada como tal. No debe presentarse como una firma realizada directamente por el cliente dentro de Ábaco. La versión publicada y aceptada queda vinculada al resultado; si cambian las condiciones, prepara una nueva versión para revisión.

Tras aceptar, la oficina convierte la propuesta una sola vez al destino que se publicó: trabajo o contrato. La conversión no emite una factura automáticamente.

## 4. Gestionar trabajos y extras

- **Trabajos** permite crear un trabajo manual o consultar uno convertido desde un presupuesto o una incidencia.
- En la ficha puedes planificar fechas y responsable, añadir fases, tareas y comprobaciones, y cambiar el estado. Para cerrar el trabajo hay que terminar o descartar las tareas abiertas.
- **Costes reales** registra horas, materiales, productos, desplazamientos, subcontratas y otros costes con su tarifa histórica. Una corrección se hace mediante anulación trazable.
- **Extras del trabajo** permite proponer un alcance adicional. Registra la decisión y su evidencia; solo un extra aprobado puede prepararse como borrador de factura.
- **Rentabilidad del trabajo** separa venta aprobada, facturación sin IVA, efectivo cobrado con IVA y costes registrados. El margen es provisional si faltan costes o gastos por imputar.

## 5. Contratos y visitas recurrentes

En **Contratos** puedes crear un contrato manual o consultar uno nacido de un presupuesto aceptado. Registra cliente, ubicación, vigencia, precio y periodicidad de cobro. Añade reglas de frecuencia por temporada y revisa la generación de visitas. Los conflictos de calendario aparecen en la ficha para que la oficina los resuelva.

La ficha permite activar, pausar o cancelar el contrato, consultar sus visitas y registrar costes reales asociados opcionalmente a una visita. Los **periodos facturables** completos pueden generar borradores revisables; una cuota parcial o afectada por una pausa exige valoración de oficina. La generación de periodos **no emite ni envía facturas automáticamente**.

## 6. Planificar y realizar visitas

### Oficina: Agenda

1. En **Agenda**, crea una visita indicando cliente, ubicación o activo cuando proceda, técnico, inicio local, duración, prioridad e indicaciones.
2. Revisa las visitas por día, semana o técnico. Si cambias una cita, registra el motivo de la reprogramación.
3. Comprueba los posibles solapamientos y las visitas recurrentes generadas antes de confirmar el plan del día.

### Técnico: Mi jornada y parte

1. En **Mi jornada**, selecciona el día. Solo aparecen tus visitas asignadas.
2. Abre una visita, consulta las indicaciones y usa **Cómo llegar** si hay dirección.
3. Pulsa **Iniciar visita** y **Abrir parte**. Registra notas, comprobaciones, mediciones, actividades, materiales, fotos e incidencias según el trabajo realizado.
4. Revisa los envíos pendientes del dispositivo. Reintenta o descarta explícitamente los que no deban enviarse; la visita no se completa mientras queden mediciones o fotos pendientes en ese dispositivo.
5. Pulsa **Completar visita** cuando el parte esté listo. El cierre conserva una versión del informe y deja un pendiente de revisión de facturación para la oficina.

El borrador del parte se conserva localmente por usuario, empresa y visita. Si otro cambio entra en conflicto, revisa ambas versiones antes de sobrescribir información. El cierre del parte no emite una factura por sí mismo.

### Compartir el informe

La oficina puede generar un enlace temporal al parte cerrado, copiarlo o compartirlo manualmente por WhatsApp. El enlace puede revocarse. También puede solicitar el envío por correo cuando el cliente tenga una dirección válida. El PDF y el correo dependen de los trabajadores y servicios configurados; revisa el estado o error mostrado antes de comunicar al cliente que la entrega se completó.

## 7. Incidencias

Una incidencia puede abrirse desde una visita o desde la ficha del cliente. Registra prioridad, ubicación o equipo, responsable, plazo, cobertura, diagnóstico y resolución. La oficina decide la cobertura y asignación; el técnico asignado puede completar el diagnóstico y la resolución autorizados.

Cuando haga falta otra actuación, la oficina puede convertir la incidencia a presupuesto, trabajo o visita. Cada conversión conserva el vínculo con la incidencia.

## 8. Facturas y cobros

1. Desde un hito aceptado, un extra aprobado o un periodo de contrato valorado, prepara un **borrador de factura**.
2. En **Facturas → Borradores de factura**, revisa el concepto y el vencimiento. El borrador todavía no tiene número.
3. Emite después de la revisión. La factura recibe número y conserva una instantánea de emisor, cliente, origen, importe e IVA.
4. Abre la factura para descargar el PDF, enviarla por email o compartirla manualmente. La aceptación del proveedor de correo y el saldo cobrado se muestran por separado.
5. Para registrar un cobro, indica importe, fecha y método. Puede ser parcial; el servidor impide superar el saldo pendiente.

**Reembolsos:** esta copia del código incluye el registro de devoluciones desde el historial de cobros de la factura. El reembolso reduce el importe cobrado y deja intacta la factura emitida. Su uso real requiere aplicar y validar la migración `20261026070000_invoice_payment_methods_refunds.sql` antes de habilitarlo. Una factura que deba corregirse legalmente necesita un documento rectificativo; el reembolso no lo sustituye.

La vista de **Facturas** muestra saldo pendiente y vencido. **Enviada** y **cobrada** son resultados de entrega y saldo, no cambios del documento emitido. Si registraste un cobro en otro sistema, comprueba que no exista ya en Ábaco antes de añadirlo manualmente.

## 9. Contabilidad, gastos e imputaciones

**Contabilidad** reúne el libro de ingresos y gastos, resúmenes por mes y trimestre y exportaciones CSV. Al crear un apunte manual, indica fecha, concepto, categoría, importe **con IVA** y tipo impositivo.

Para relacionar un gasto con la rentabilidad de un trabajo o contrato:

1. Registra primero el gasto en el libro.
2. En ese gasto, pulsa **Imputar** y elige trabajo o contrato.
3. Indica el importe bruto que corresponde a ese destino. Puedes repartir un mismo gasto en varias imputaciones sin superar el total registrado.
4. Si el importe ya existe como coste operativo del mismo trabajo o contrato, selecciónalo en **Coste operativo ya registrado**. El importe sin IVA debe coincidir; así no se suma dos veces.
5. Si necesitas corregir la imputación, usa **Anular** y registra otra. El historial permanece.

La rentabilidad toma el gasto imputado sin IVA. Los gastos sin imputación quedan fuera del margen de cada trabajo o contrato. Una cifra de coste no informada no significa coste cero.

Los CSV de clientes, facturas, cobros y gastos están disponibles para propietario y administrador. Antes de entregar datos a una asesoría, comprueba el periodo y revisa los importes en la aplicación. El acceso limitado propio del asesor y el marcado de periodos revisados aún no están implementados.

## 10. Ajustes y equipo

En **Ajustes** se configuran los datos de la empresa que aparecen en documentos, la marca, valores por defecto, miembros e invitaciones. Solo propietario y administrador pueden gestionar las opciones autorizadas; el propietario puede nombrar administradores. Revisa especialmente la identificación fiscal, contacto, dirección, cuenta bancaria e IVA antes de emitir documentos.

## 11. Cómo saber si un cambio quedó guardado

La aplicación muestra el estado de guardado. Si aparece **Guardando**, espera antes de salir o iniciar otra acción dependiente. Si aparece un **error**, el cambio puede seguir visible en pantalla sin estar confirmado en el servidor: usa el reintento ofrecido y comprueba el resultado. No interpretes una vista local como prueba de que un cobro, documento o envío se haya completado.

## 12. Límites de esta entrega

Esta guía corresponde al **estado del repositorio**, no acredita que todas las migraciones o servicios estén desplegados. Antes de operar en producción, el responsable técnico debe aplicar las migraciones pendientes en un entorno de pruebas, ejecutar las pruebas de base de datos, verificar permisos y saldos, y configurar los trabajadores de PDF y correo. Las migraciones recientes de facturación, imputaciones y reembolsos aún no tienen validación de base de datos confirmada en esta copia.

Todavía no están completos, entre otros, el portal del cliente, inventario y compras, documentos rectificativos, facturación con líneas y anticipos generales, conectores bancarios/fiscales, pagos del cliente final, API pública, automatizaciones amplias y todos los paquetes verticales previstos en el [plan de desarrollo integral](../10-plan-desarrollo-integral.md). No se deben ofrecer como funciones disponibles.
