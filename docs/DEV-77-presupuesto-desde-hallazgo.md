# DEV-77 · Presupuesto exprés desde un hallazgo

En la ficha del cliente o en un parte, abre la incidencia y elige **Preparar presupuesto**. Comprueba el cliente y el centro mostrados, edita el título y escribe una partida por línea. El borrador se crea con las partidas pendientes de valorar. No se copian el diagnóstico, la resolución ni las notas operativas. No se publica ni se envía nada al crearlo; la valoración, aprobación y envío siguen su circuito habitual.

Las fotos de la visita de origen son opcionales y empiezan sin seleccionar. Solo se pueden referenciar tras abrirlas y confirmar el contenido. Las referencias quedan en el panel de información interna del borrador, protegidas por los permisos habituales de la visita y del almacenamiento privado. No se duplican los archivos ni se insertan rutas, URL, fotos o leyendas en el documento, el PDF o el enlace público. Si cambia la asociación de cliente del presupuesto, desaparece el contexto anterior.

La conversión utiliza el comando transaccional de incidencias existente. El servidor vuelve a validar el centro y el cliente bajo bloqueo, comprueba el origen de cada foto y mantiene un único presupuesto por incidencia. Reintentar la misma confirmación devuelve el mismo borrador, sin reescribir cambios posteriores. Las conversiones a trabajo o visita y los presupuestos previos conservan su comportamiento.

## Validación local

- `pnpm exec vitest run server/incident-quote-draft-database.test.ts`: conversión canónica más migración en PGlite, permisos y aislamiento entre empresas, selección de fotos, reintentos y ausencia de exposición de referencias en las filas del documento.
- `node scripts/check-incident-quote-browser.cjs`: navegación con teclado a 320 px desde el hallazgo hasta la revisión y el borrador, reintento y comprobación de que la vista previa no incluye fotos. Servir la app local en el puerto 4195 con `VITE_SUPABASE_URL=http://localhost:54399` y `VITE_SUPABASE_PUBLISHABLE_KEY=fixture`. La prueba usa respuestas simuladas y no toca producción.
