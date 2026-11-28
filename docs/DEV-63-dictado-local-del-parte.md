# DEV-63 · Dictado local de notas

El parte editable permite abrir «Dictar notas», comprobar si el navegador tiene dictado local en español (España) y, por separado, iniciar el micrófono. Se usa la [API de reconocimiento en el dispositivo](https://wicg.github.io/speech-api/#speechreco-section) solo en contexto seguro, con el paquete local disponible y con `processLocally = true` validado antes de cada inicio. No se instalan paquetes automáticamente, no se usa el modo en red ni `webkitSpeechRecognition` como alternativa.

El audio no pasa por el código de Menos Líos, que solo recibe los resultados textuales del navegador. Los resultados finales se muestran en una vista previa editable en memoria. Cerrar el dictado descarta la vista previa. «Añadir a las notas» conserva el texto existente y usa el borrador de siempre; solo «Guardar parte» envía el parte. Cerrar el dictado o la visita, cambiar de contexto o pasar la pestaña a segundo plano detienen el micrófono.

Si el navegador no es compatible o no concede permiso, la vista previa sigue disponible para escribir. En móvil se explica cómo usar, opcionalmente, el micrófono del teclado: su disponibilidad, idioma y privacidad dependen del dispositivo y de su configuración, no de Menos Líos.

## Prueba de navegador

Construir o servir la app con `VITE_SUPABASE_URL=http://localhost:54399` y `VITE_SUPABASE_PUBLISHABLE_KEY=fixture` en el puerto local 4197. Con Playwright, ejecutar `node scripts/check-visit-dictation-browser.cjs`. La prueba recorre Mi jornada a 320 px con teclado y simula la API del navegador y el guardado; no permite peticiones de dictado reales ni verifica compatibilidad con un dispositivo físico.
