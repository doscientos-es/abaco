# Validación de reglas de vacaciones y cobertura

Ficha de trabajo para cerrar con el cliente las decisiones necesarias antes de
automatizar la cobertura de servicios. No completar las respuestas por inferencia.

## Base confirmada

- El trabajador puede solicitar vacaciones y administración puede aprobarlas o rechazarlas.
- Al aprobar una ausencia, hay que detectar las visitas asignadas durante ese periodo
  y ayudar a resolver su cobertura.
- Las propuestas deben poder revisarse por administración. No se aplica una
  reasignación automática hasta que el cliente apruebe expresamente sus reglas.
- Las ausencias aprobadas deben considerarse al planificar nuevas asignaciones.
- Los servicios sin cobertura y las excepciones deben quedar visibles para administración.

## Decisiones que debe responder el cliente

Registrar cada respuesta como **pendiente**, **acordada** o **no aplica**. Añadir
responsable y fecha cuando se acuerde; dejar la respuesta vacía mientras no se valide.

| Tema                 | Pregunta para validar                                                                                                                                          | Respuesta acordada |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Aprobación           | ¿Se puede aprobar una solicitud antes de resolver la cobertura? ¿Se permiten aprobaciones parciales o condicionadas?                                           | Pendiente          |
| Elegibilidad         | ¿Qué requisitos hacen que una persona sea candidata? Confirmar competencias/habilitaciones, disponibilidad y ubicación aplicables.                             | Pendiente          |
| Horarios             | ¿Cómo se computan duración, desplazamientos, descansos, solapamientos y disponibilidad entre servicios?                                                        | Pendiente          |
| Carga y prioridad    | ¿Hay límites de carga diaria/semanal? ¿Cómo se priorizan solicitudes o servicios cuando compiten por la misma persona?                                         | Pendiente          |
| Confirmación         | ¿Administración confirma siempre cada propuesta o se permiten casos de asignación automática? Si se permite, especificar exactamente las reglas y excepciones. | Pendiente          |
| Sin candidato        | ¿Quién resuelve un servicio sin cobertura y a quién se escala? ¿Qué plazos y estados se requieren?                                                             | Pendiente          |
| Recurrencia          | ¿Cómo tratar una ausencia que coincide con parte de un servicio recurrente y qué ocurrencias se pueden modificar?                                              | Pendiente          |
| Permisos e historial | ¿Qué roles pueden solicitar, decidir, confirmar cambios y consultar el historial? ¿Qué comentarios y estados se necesitan?                                     | Pendiente          |
| Notificaciones       | ¿Quién recibe avisos por solicitud, decisión, sustitución y excepción, y por qué canal?                                                                        | Pendiente          |

## Registro de acuerdos

| Fecha     | Participantes | Decisiones cerradas | Pendientes / responsable |
| --------- | ------------- | ------------------- | ------------------------ |
| Pendiente | Pendiente     | Pendiente           | Pendiente                |

## Criterio para pasar a implementación

- Las reglas que afectan a la elegibilidad, prioridad y carga están acordadas o
  explícitamente fuera del primer alcance.
- Está definido quién confirma una sustitución y quién resuelve los casos sin cobertura.
- Si se aprueba automatización, sus condiciones y excepciones están escritas y aprobadas.
- Mientras falte cualquiera de estas aprobaciones, el producto solo presenta propuestas
  revisables y no modifica asignaciones automáticamente.

Fichaje, firmas y uso obligatorio de teléfonos personales son decisiones separadas;
esta ficha no los aprueba ni los incorpora al alcance.
