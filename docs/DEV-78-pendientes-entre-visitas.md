# DEV-78: pendientes entre visitas

El parte incluye un bloque interno con dos acciones independientes: **Guardar pendiente** para transmitir un título concreto y **Marcar resuelto** desde la visita que lo recibe. No extrae notas, recomendaciones, fotos, incidencias ni comprobaciones. Tampoco añade nada al PDF, correo, enlace compartido o snapshot del parte. Guarda un solo registro interno por pendiente; no lo copia a cada visita.

## Qué visita lo recibe

- Solo se transmite tras completar la visita de origen. Si se omite o cancela el origen, no se transmite.
- El ámbito debe ser el mismo: empresa, cliente, centro, activo y contexto de obra o contrato. Para un contrato recurrente debe coincidir también la regla de trabajo. Sin centro solo se admite una obra o contrato concretos.
- De las visitas posteriores del mismo ámbito, se elige la primera asignada y vigente por fecha e identificador. No se elige «la primera que puede ver este usuario», lo cual duplicaría el destinatario. Se excluyen visitas omitidas, canceladas, finalizadas, vencidas sin iniciar y sin asignación válida.
- Si se mueve u omite la visita receptora, se evalúa de nuevo. Un pendiente sin cita queda en espera. Si se completa la receptora sin resolverlo, sigue a la próxima visita elegible.
- El equipo o técnico de la visita receptora ven solo el título escrito para ellos, no el parte de origen. La resolución requiere tener en curso la visita receptora y conservar acceso. Se conserva fecha, actor y visita de resolución.

## Seguridad y verificación

| Acción   | Quién puede                                                                                         | Persistencia y control                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leer     | Oficina de la empresa o usuario asignado, de forma directa o por equipo según las reglas existentes | RPC autentificado con wrapper público invocador y lógica privilegiada privada; no hay permisos directos a la tabla ni uso del esquema privado. El receptor no recibe ids, autores ni notas de origen.    |
| Guardar  | Los mismos roles, si la empresa admite escritura y la visita de origen está abierta                 | RPC deriva el ámbito; bloquea la fila de origen para serializar con cierre y deduplicar. Conserva clave de operación y título normalizado por origen; no duplica un pendiente recibido que siga abierto. |
| Resolver | Los mismos roles, si la empresa admite escritura y la visita receptora elegible está en curso       | RPC comprueba de nuevo el destino y la asignación; bloquea visita y pendiente. No modifica partes, asignaciones, ni la agenda.                                                                           |

Pruebas locales:

- `pnpm exec vitest run server/visit-handoff-database.test.ts`: migración y función de asignación real en PGlite con datos ficticios, permisos, dos empresas, ámbito, reasignación, replanificación y repetición de operaciones. PGlite prueba el contrato y reintentos solapados desde el cliente, no sesiones separadas del servidor.
- `scripts/check-visit-handoffs-browser.cjs`: navegador a 320 px, acciones con Enter, respuesta perdida y clave estable en el reintento. Usa solo respuestas locales interceptadas. Los pasos de arranque están en el encabezado.

Despliegue coordinado: aplicar primero la migración aditiva en el entorno aprobado y después publicar la interfaz. Para retirar el flujo, revertir la interfaz sin borrar el historial almacenado. No se necesita reescribir ningún parte previo.
