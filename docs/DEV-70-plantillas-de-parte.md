# DEV-70 · Plantillas de parte por servicio

En **Personalizar → Documentos**, un administrador puede editar las comprobaciones de limpieza, climatización y puesta en marcha. Las líneas iniciales son propuestas, no plantillas publicadas. **Guardar borrador** conserva los cambios sin ponerlos a disposición de la agenda. **Publicar plantilla** crea la versión disponible para copiar.

Desde **Trabajos → visitas programadas → Ver parte**, **Usar una plantilla de parte** permite previsualizar y copiar una versión publicada. Se crea el primer borrador de la visita, con comprobaciones desmarcadas. El técnico asignado lo usa como cualquier otro parte; puede marcar y editar sus comprobaciones. No se copian notas, recomendaciones, datos de contratos, ni los borradores de las plantillas. Solo se debe incluir texto operativo apto para un parte que pueda compartirse.

El servidor bloquea la visita como en el guardado normal del parte y rechaza una copia si el parte ya existe o si la visita no está programada. La copia conserva la checklist exacta de la versión que se aplicó, sin enlaces dinámicos ni cambios retroactivos. Si otro dispositivo tenía un parte sin enviar, no se altera ese borrador local. El editor existente permite comparar los cambios cuando vuelva a tener conexión.

La biblioteca y la trazabilidad quedan en `app_private`: acceso RPC acotado al administrador de la empresa, versión, operación, responsable y hora de aplicación. El técnico solo ve lo que ya permite su acceso a partes asignados. No se modifican el circuito de compartir, las versiones cerradas ni sus exportaciones.

## Verificación

- `pnpm exec vitest run server/visit-report-template-database.test.ts`: migración local en PGlite, usando la función de guardado, revisiones y políticas de asignación existentes.
- `node scripts/check-visit-report-template-browser.cjs`: flujo de administración y técnico a 320 px con teclado. Arrancar Vite en el puerto 4196 con `VITE_SUPABASE_URL=http://localhost:54399` y `VITE_SUPABASE_PUBLISHABLE_KEY=fixture`. Se simula Supabase; nunca apunta a producción.

Aplicar la migración aditiva aprobada antes de publicar la interfaz. No se necesita migrar ni reescribir partes existentes.
