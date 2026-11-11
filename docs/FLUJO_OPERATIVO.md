# Flujo operativo: presupuesto a parte cerrado

Estado contrastado con la rama actualizada `main` de Ábaco el 11/11/2026. La presencia de migraciones en Git
no demuestra que se hayan aplicado a Supabase ni que el recorrido se haya validado allí.

## Flujo objetivo

1. Administración mantiene servicios reutilizables con sus tareas.
2. Un presupuesto selecciona uno o varios servicios; la aceptación crea un contrato y sus
   trabajos/servicios configurables sin perder el alcance aceptado.
3. Administración planifica las visitas en agenda y asigna cada una a una persona o equipo.
4. Cada trabajador ve sus visitas y tareas asignadas en una jornada sencilla desde el móvil.
5. Al iniciar una visita se guarda hora real y, solo si la empresa activa la opción, se solicita
   permiso para registrar una ubicación puntual.
6. El trabajador completa o deja sin marcar las tareas pertinentes, rellena el parte y lo guarda.
7. El cliente firma en pantalla o administración importa el parte firmado en papel.
8. El cierre conserva una versión inmutable con autoría, fecha y método de conformidad, y la
   oficina recibe una notificación o pendiente visible para revisar el parte.

## Estado actual de `main`

| Tramo | Estado |
| --- | --- |
| Presupuestos y aceptación pública/manual | Implementado; la aceptación guarda evidencia. |
| Conversión al contrato y servicios múltiples reutilizables | Parcial/pendiente: existe conversión tradicional, pero falta el flujo «Tus servicios» y selección múltiple. Hay una implementación más avanzada en la rama local `DEV-16-panel-superadmin-de-abaco-empresas-pagos-y-precios-personalizados`, que aún no está integrada a `main`. |
| Visitas en agenda y asignación individual | Implementado. |
| Asignación de visitas a equipos y visibilidad para sus miembros | Pendiente: `main` puede asignar equipos a trabajos, pero las visitas y la jornada del técnico se basan en asignación individual. |
| Jornada individual, inicio, parte, tareas, fotos y cierre | Implementado parcialmente: inicio/cierre y partes; falta unificar visualmente las tareas heredadas de servicios y reforzar el recorrido móvil. |
| Captura opcional de ubicación al iniciar | Implementada en esta rama de trabajo, pendiente de aplicar y validar la migración y el flujo en un entorno. Desactivada por defecto; una captura, sin seguimiento continuo. |
| Firma dibujada del cliente | No implementada. |
| Parte en papel, impresión e importación posterior | Adjuntos privados de PDF/foto pueden cargarse desde administración en la rama de trabajo, pero no hay un circuito completo de impresión/importación ligado al cierre del técnico en `main`. |
| Cierre condicionado a firma digital o constancia física | No implementado. Hoy el cierre de visita puede generar una instantánea antes de cualquier firma. |
| Aviso a administración al cerrar | La versión cerrada queda consultable; falta comprobar y completar el aviso operativo para el flujo acordado. |

## Orden recomendado para completar

1. Integrar en `main` el modelo de servicios múltiples y presupuesto → contrato → trabajos,
   preservando las funciones existentes de PDF, parte, seguridad y ausencias. Añadir los
   servicios compartidos y asociar sus N tareas a las visitas generadas.
2. Añadir asignación explícita por persona o por equipo a nivel de visita. Definir qué miembros
   pueden verla, cómo se evita el doble reparto y cómo se conservan cambios de equipo.
3. Simplificar «Mi jornada»: agenda móvil, una acción clara para iniciar, tareas del trabajo,
   guardado de borradores recuperables y estados de sincronización comprensibles.
4. Diseñar el cierre como flujo: parte completo → firma dibujada del cliente o selección de
   «firma en papel» → persistencia de evidencia → cierre inmutable. La importación debe validar
   tipo y tamaño de archivo, empresa/visita, permisos y reintentos idempotentes.
5. Enviar el cierre a una bandeja/aviso de administración y permitir revisar/descargar el parte.
6. Probar el recorrido completo con cuentas separadas de oficina, trabajador y cliente en
   staging; comprobar también desconexión móvil, reintentos, permisos y cierre duplicado.

## Decisiones que faltan

- Si un trabajador asignado a equipo puede cerrar por sí solo o si todos los integrantes deben
  confirmar la visita; recomendación inicial: un responsable individual cierra y el equipo es
  una asignación operativa visible.
- Qué significa «no marcar» una tarea: no hecha, no aplicable o simplemente no registrada.
  Debe quedar distinguible en el parte.
- Si la firma del cliente es obligatoria en todos los trabajos o se permite un motivo de ausencia.
- Retención y acceso a coordenadas, firma e imagen/PDF; mostrar aviso al técnico antes de activar
  la captura de ubicación y fijar quién puede consultar esos datos.
- Qué recibiría administración: aviso dentro de Ábaco, correo, o ambos.

La firma manuscrita capturada en pantalla registra una conformidad asociada a un parte; no se
debe describir como firma electrónica cualificada o certificada sin implementar y validar ese
nivel de identidad y garantía.
