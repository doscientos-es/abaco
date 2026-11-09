# Validación de reglas de vacaciones y cobertura

Propuesta de valores predeterminados para los casos habituales de vacaciones y
cobertura en Ábaco. Son recomendaciones para validar con el cliente, no acuerdos
ni reglas laborales asumidas. Las opciones avanzadas deben ser configurables sin
hacer más difícil el flujo común.

## Base confirmada

- El trabajador puede solicitar vacaciones y administración puede aprobarlas o rechazarlas.
- Al aprobar una ausencia, hay que detectar las visitas asignadas durante ese periodo
  y ayudar a resolver su cobertura.
- Las propuestas deben poder revisarse por administración. No se aplica una
  reasignación automática hasta que el cliente apruebe expresamente sus reglas.
- Las ausencias aprobadas deben considerarse al planificar nuevas asignaciones.
- Los servicios sin cobertura y las excepciones deben quedar visibles para administración.

## Valores predeterminados recomendados para Ábaco

| Caso                 | Comportamiento inicial recomendado                                                                                                                                                                            | Motivo                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fechas solicitadas   | Tratar el intervalo como fechas locales inclusivas para detectar servicios afectados.                                                                                                                         | Evita dudas sobre si el último día solicitado está incluido. No calcula saldo legal de vacaciones. |
| Solicitud pendiente  | No bloquea la planificación; muestra un aviso de posible ausencia.                                                                                                                                            | Evita reservar personal por solicitudes que aún pueden rechazarse.                                 |
| Vacaciones aprobadas | Bloquean nuevas asignaciones incompatibles y aparecen en la disponibilidad del trabajador.                                                                                                                    | Evita crear conflictos que la oficina tendría que corregir después.                                |
| Servicio ya asignado | Al aprobarse la ausencia, se crea un pendiente de cobertura por cada servicio afectado.                                                                                                                       | Hace visible el trabajo que queda por resolver sin confundirlo con una incidencia técnica.         |
| Candidatos           | Excluir personal inactivo, ausente o con un conflicto confirmado; exigir las competencias marcadas como obligatorias. Si faltan datos de disponibilidad, ubicación o requisitos, mostrar “requiere revisión”. | No presentar como segura una cobertura basada en información incompleta.                           |
| Orden de propuestas  | Mostrar primero los candidatos elegibles; ordenar de forma informativa por menor carga planificada y explicar los motivos. Administración elige y confirma; el orden nunca asigna por sí solo.                | Ayuda a repartir el trabajo sin convertir una puntuación opaca en una decisión automática.         |
| Confirmación         | Reasignación manual por administración. Revalidar conflictos y disponibilidad justo antes de guardar.                                                                                                         | Evita asignaciones dobles cuando otras propuestas o cambios se han producido entretanto.           |
| Sin sustituto        | Mantener la ausencia y dejar el servicio como excepción abierta, visible y asignada a revisión administrativa. No cancelar ni marcar como cubierto automáticamente.                                           | Separa el derecho/decisión de ausencia de la resolución operativa y evita ocultar el riesgo.       |
| Servicio recurrente  | Si está habilitado, afectar solo las ocurrencias dentro del periodo de ausencia; conservar intacto el resto de la serie.                                                                                      | Limita el cambio a lo solicitado y evita efectos laterales.                                        |
| Avisos e historial   | Avisar al trabajador de la decisión, al sustituto solo tras confirmar y a administración de excepciones. Preferir aviso dentro de Ábaco; usar correo si está configurado. Registrar autor, fecha y cambios.   | Mantiene a cada persona informada sin exigir que use un teléfono personal.                         |

Las fechas se interpretan en la zona horaria de la empresa. No calcular cumplimiento
de jornada, descansos legales ni desplazamientos hasta que el cliente confirme los
datos y reglas aplicables. Si no hay información suficiente para descartar un conflicto,
no presentar al candidato como disponible automáticamente.

## Validaciones que siguen siendo del cliente

Registrar cada respuesta como **pendiente**, **acordada** o **no aplica**, junto con
responsable y fecha. Los defaults anteriores se mantienen si el cliente no solicita
un comportamiento distinto y no hay un requisito laboral que lo contradiga.

| Tema                          | Recomendación inicial                                                                                                         | Confirmación necesaria                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Aprobación frente a cobertura | No rechazar automáticamente una solicitud por falta de sustituto; abrir una excepción para administración.                    | ¿La empresa acepta separar ambas decisiones? Por defecto, la solicitud completa se aprueba o rechaza; ¿necesita aprobación parcial? |
| Requisitos del puesto         | Solo tratar como obligatorias las competencias configuradas como requisito del servicio.                                      | ¿Qué competencias, habilitaciones y restricciones de ubicación son imprescindibles?                                                 |
| Horarios y carga              | No inventar límites. Si faltan horas de trabajo, descansos o desplazamientos, señalar que hace falta revisión administrativa. | ¿Qué jornada, descansos, tiempos de desplazamiento y límites máximos deben aplicarse?                                               |
| Prioridad                     | Orden informativo por menor carga planificada; no asignar automáticamente al primer candidato.                                | ¿Hay reglas de prioridad o reparto distintas para ciertos equipos/servicios?                                                        |
| Recurrencia                   | Si se incluye en el alcance, cambiar solo las ocurrencias que coinciden con la ausencia.                                      | ¿Hay tipos de servicio recurrente que necesiten otro tratamiento?                                                                   |
| Escalado y permisos           | Avisar a administración y dejar la excepción abierta; sin plazos ficticios.                                                   | ¿Quién es responsable de resolverla y qué roles pueden aprobar y confirmar?                                                         |
| Normativa y privacidad        | No asumir cumplimiento legal a partir de esta propuesta de producto.                                                          | Validar con el cliente los requisitos laborales, de privacidad y conservación aplicables.                                           |

## Registro de acuerdos

| Fecha     | Participantes | Defaults aceptados o cambios acordados | Pendientes / responsable |
| --------- | ------------- | -------------------------------------- | ------------------------ |
| Pendiente | Pendiente     | Pendiente                              | Pendiente                |

## Criterio para pasar a implementación

- El cliente ha aceptado estos defaults o ha indicado los cambios que necesita.
- Se ha definido quién aprueba las vacaciones, confirma sustituciones y resuelve excepciones.
- Los requisitos legales y laborales aplicables se han validado por separado.
- La reasignación automática sigue desactivada salvo aprobación expresa de sus criterios,
  límites y excepciones; el MVP conserva propuestas revisables por administración.

Fichaje, firmas y uso obligatorio de teléfonos personales son decisiones separadas;
esta ficha no los aprueba ni los incorpora al alcance.
