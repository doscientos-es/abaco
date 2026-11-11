Usa el mcp de supabase-05 para la conexión con la base de datos, cada vez que crees o modifiques una migration o function subela directamente a supabase.
Siempre usa el atlassian de Doscientos, nunca de Mesalvo.

## Flujo para tareas de Jira

Cuando Pol pida «haz la tarea N» (o equivalente), sigue este flujo hasta dejar el trabajo publicado:

1. Lee la tarea de Jira completa: descripción, criterios de aceptación, comentarios, relaciones y estado vigente. Comprueba el código actual y las instrucciones relevantes del repositorio.
2. Define el alcance y una solución coherente con la arquitectura existente. Resuelve las dudas menores con sentido común, sin bloquear el avance; documenta en el PR las decisiones tomadas unilateralmente y cualquier limitación importante.
3. Crea una rama con la clave Jira en el nombre, por ejemplo `feat/DEV-37-descripcion-corta`, para que la rama y el PR puedan vincularse automáticamente a Jira.
4. Trabaja en el checkout actual si está disponible y no interrumpes otro trabajo. Si el checkout actual ya está ocupado por otra tarea o rama de trabajo, crea un worktree aislado para esta rama.
5. Implementa el alcance completo, incluidos los cambios necesarios de interfaz, lógica, base de datos, permisos y documentación. Ejecuta las comprobaciones adecuadas al cambio y comunica cualquier verificación que no haya podido completarse.
6. Crea el commit, publica la rama en GitHub y abre un PR. Incluye la clave Jira en el título o cuerpo, resume la solución y las decisiones unilaterales, e indica las comprobaciones realizadas. Comprueba que Jira muestre la rama y el PR vinculados; comparte el enlace del PR de GitHub al terminar.
7. Si creaste un worktree local, elimínalo cuando el trabajo esté publicado y no queden cambios sin guardar. Conserva la rama remota y el PR. No elimines worktrees ni cambios ajenos a esta tarea.
