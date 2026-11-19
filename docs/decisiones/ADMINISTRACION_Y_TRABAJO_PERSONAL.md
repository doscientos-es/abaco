# Administración y trabajo personal

Actualizado el 19 de noviembre de 2026. La aplicación incorpora las vistas personales y la base de datos admite la asignación de administradores. Comprobar el despliegue de la interfaz antes de considerarlo disponible para los usuarios.

## Decisión

Una persona conserva una sola cuenta y pertenencia a la empresa. El rol de administración determina sus permisos; participar en el trabajo es una posibilidad independiente, elegida al asignar personas. No es necesario crear otra cuenta ni ocupar otra plaza. Un administrador que no realiza trabajo simplemente no se asigna.

Mantener una sola navegación para el administrador, con una entrada personal «Mi jornada» claramente diferenciada de la planificación general y el resto de gestión. Evitar obligar a cambiar de panel para alternar entre visitar clientes y realizar tareas de oficina. La persona con rol usuario sigue en su espacio limitado y no recibe permisos administrativos. La presentación debe funcionar en móvil y escritorio sin utilizar controles de interfaz como sustituto de los permisos de servidor.

Un administrador ya puede gestionar gastos en Contabilidad y, en la planificación de un trabajo, escoger como responsable a cualquier miembro de la misma empresa. Ser responsable de un trabajo no equivale a estar asignado a sus visitas ni implica que aparezcan en la jornada personal.

## Implementación y comprobaciones

El administrador dispone de «Mi jornada», «Mi horario» y «Mis ausencias» en la navegación de gestión. Las consultas personales filtran por usuario; las vistas de equipo permanecen en Trabajadores. La opción de asignarse como responsable de un trabajo es independiente de las asignaciones de visitas y contratos.

- La migración `admin_personal_work` adapta las comprobaciones de pertenencia para aceptar administradores en visitas y contratos y habilita su agenda y sus solicitudes personales. Conserva los controles de empresa y los permisos administrativos existentes.
- `supabase/tests/database/admin_personal_work.test.sql` comprueba con datos temporales la asignación propia, firma del contrato, solicitud de ausencia y aislamiento entre personas y empresas.
- La asignación a un trabajo no garantiza que se genere una visita individual para cada persona: las limitaciones existentes del modelo de visitas y de generación automática siguen aplicándose.
- Revisar en el entorno desplegado los flujos de partes, fotografías, incidencias y generación automática; la prueba de base de datos no sustituye una prueba completa en navegador.

Los gastos del trabajador que no es administrador son una cuestión distinta: la contabilidad actual está restringida. No ampliar su acceso general a información financiera por implementar la jornada de administradores; cualquier captura personal de gastos necesita definir permisos, propiedad, revisión y visibilidad de forma específica.
