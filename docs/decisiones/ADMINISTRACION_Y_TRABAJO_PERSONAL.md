# Administración y trabajo personal

Fecha: 19 de noviembre de 2026. Decisión de producto y trabajo pendiente; no describe funcionalidad ya implementada salvo cuando se indique.

## Decisión

Una persona conserva una sola cuenta y pertenencia a la empresa. El rol de administración determina sus permisos; participar en el trabajo es una posibilidad independiente, elegida al asignar personas. No es necesario crear otra cuenta ni ocupar otra plaza. Un administrador que no realiza trabajo simplemente no se asigna.

Mantener una sola navegación para el administrador, con una entrada personal «Mi jornada» claramente diferenciada de la planificación general y el resto de gestión. Evitar obligar a cambiar de panel para alternar entre visitar clientes y realizar tareas de oficina. La persona con rol usuario sigue en su espacio limitado y no recibe permisos administrativos. La presentación debe funcionar en móvil y escritorio sin utilizar controles de interfaz como sustituto de los permisos de servidor.

Un administrador ya puede gestionar gastos en Contabilidad y, en la planificación de un trabajo, escoger como responsable a cualquier miembro de la misma empresa. Ser responsable de un trabajo no equivale a estar asignado a sus visitas ni implica que aparezcan en la jornada personal.

## Pendiente de implementación

La opción de asignarse como responsable de un trabajo no resuelve por sí sola la participación en visitas o tareas de contratos. No activar la entrada de jornada de administrador ni incluir administradores en selectores que el servidor vaya a rechazar hasta completar y verificar el recorrido entero.

1. Revisar el estado efectivo de la base de datos y el historial de migraciones, pues los archivos locales no prueban el estado remoto. El repositorio exige utilizar el MCP `supabase-05` y subir directamente cualquier migración o función modificada.
2. Permitir seleccionar miembros administradores, de forma opcional, en visitas, trabajos de contrato, tareas y asignaciones individuales o de equipo. Mantener la validación de pertenencia a la misma empresa y los controles de concurrencia y disponibilidad.
3. Revisar las validaciones en las funciones vigentes de creación y reprogramación de visitas, contratos, tareas, asignación múltiple, turnos y generación automática. No cambiar solo las listas de la interfaz: existen comprobaciones que actualmente aceptan únicamente `user` o `technician`.
4. Ampliar la consulta de visitas personales para el administrador sin devolverle como «mías» las visitas de toda la empresa. Incluir sus asignaciones individuales y de equipo conforme a las reglas actuales, tanto en día como en calendario. Comprobar tareas, partes, fotos, incidencias y finalización; conservar la semántica existente de ubicación y permisos.
5. Añadir la entrada «Mi jornada» al menú del administrador y permitir la ruta. Mantener la planificación general accesible, el área de usuario restringida y la gestión de gastos existente. Decidir por separado si las ausencias y el horario personal requieren cambios en sus permisos; no asumir que son equivalentes a la vista administrativa del equipo.
6. Probar el flujo completo con una empresa de una persona y con un equipo mixto: asignarse, consultar la jornada, iniciar y completar visitas y registrar gastos. Cubrir asignaciones a otro miembro, equipo, empresa ajena, cambios de usuario/empresa y permisos de trabajador. Verificar los casos de asignación múltiple y generación de visitas, sin prometer que todas las personas de un trabajo reciban una visita individual si el modelo aún no lo soporta.

Los gastos del trabajador que no es administrador son una cuestión distinta: la contabilidad actual está restringida. No ampliar su acceso general a información financiera por implementar la jornada de administradores; cualquier captura personal de gastos necesita definir permisos, propiedad, revisión y visibilidad de forma específica.
