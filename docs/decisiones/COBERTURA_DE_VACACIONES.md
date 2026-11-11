# Ausencias y cobertura de visitas

Estado contrastado con la aplicación y las migraciones del repositorio el 11/11/2026.
Esta ficha distingue el comportamiento implementado de las decisiones comerciales o
laborales que aún deben acordarse. No describe una especificación pendiente de construir.

## Comportamiento implementado

- El personal puede solicitar vacaciones, bajas, asuntos propios u otras ausencias;
  administración puede pedir información, aprobar o rechazar. También puede registrar,
  editar o cancelar periodos en nombre del personal.
- Las fechas son inclusivas y se interpretan en la zona horaria de la empresa/centro.
  Se conservan comentarios, autoría e historial de cambios; la aplicación no calcula
  saldos legales ni jornadas.
- En la planificación se señalan los conflictos con vacaciones y bajas aprobadas.
  La base de datos impide asignar o reprogramar una visita dentro de esos periodos.
- Al revisar una ausencia aprobada se muestran las visitas futuras afectadas. Para visitas
  aún no iniciadas, administración puede ver posibles compañeros del mismo equipo (si la
  visita pertenece a uno) que no tengan solapamiento de agenda ni una ausencia aprobada.
  La lista es una ayuda informativa: no verifica competencias, desplazamientos, horario
  laboral ni aptitud real. Administración confirma expresamente la persona y el cambio
  vuelve a validar disponibilidad al guardar.
- Una visita ya iniciada no se reasigna desde este flujo. Si no hay candidato o la visita
  está en curso, la cobertura debe coordinarse manualmente.
- Los asuntos propios y otros tipos de ausencia no se incluyen en el bloqueo de agenda ni
  en el cálculo de candidatos de cobertura. No asumir que se comportan como vacaciones.

## Límites y decisiones pendientes

Estas reglas no están implementadas y no deben presentarse como acordadas:

- cálculo de saldos, cupos, aprobaciones parciales o derechos legales;
- competencias, habilitaciones, ubicación, descansos, desplazamientos y límites de jornada;
- ordenación de candidatos por carga de trabajo, puntuaciones o asignación automática;
- reglas especiales para servicios recurrentes, festivos o ausencias de asuntos propios;
- destinatarios, plazos y canales adicionales de avisos, conservación o requisitos laborales.

Si se amplía el flujo, acordar con el cliente las reglas que afectan a su operación y validar
por separado los requisitos legales y de privacidad. Hasta entonces, conservar la selección
manual, mostrar claramente sus límites y no bloquear la aprobación de una ausencia por no
haber sustituto.

## Referencias de implementación

- `src/features/vacations/`: solicitudes, gestión, avisos y revisión de cobertura.
- `src/features/visits/ui/agenda-page.tsx`: avisos de conflicto en planificación.
- `supabase/migrations/20261109180000_vacation_service_visit_coverage.sql` y
  `20261109190000_absence_request_types.sql`: conflictos, candidatos y restricciones.
- `supabase/migrations/20261109200000_absence_information_followup.sql`: solicitud y
  respuesta de información adicional.
- `supabase/tests/database/`: pruebas de cobertura, solicitudes, permisos y gestión.
