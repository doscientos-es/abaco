# IA: cálculo inicial de costes

La tarifa prevista es de 3,75 € por usuario y mes. La activación debe cobrarse antes de
conceder acceso, proporcionalmente al tiempo que queda del ciclo vigente. En ciclos anuales
la tarifa completa es de 45 € por usuario. La desactivación no genera devolución por el
periodo ya cobrado y la reactivación dentro de ese ciclo no debe volver a cobrarlo. La
renovación incluye solo los usuarios que siguen activos. La facturación aún no está
implementada: la calidad, el consumo real y la disponibilidad del modelo deben medirse
antes de cobrar.

## Modelo propuesto

Gemini 3.1 Flash-Lite acepta texto, imágenes y PDF y ofrece respuestas estructuradas.
La tarifa estándar de pago consultada el 23 de noviembre de 2026 es de 0,25 USD por millón
de tokens de entrada de texto o imagen y 1,50 USD por millón de tokens de salida, incluidos
los de razonamiento. Los PDF se facturan como entrada de imagen. La modalidad de pago indica
que el contenido no se usa para mejorar los productos de Google; hay que revisar también las
condiciones de tratamiento de datos aplicables antes de habilitarla.

Fuente: [precios de Gemini](https://ai.google.dev/gemini-api/docs/pricing).

## Escenario ilustrativo por usuario y mes

Suponiendo 200 solicitudes, con un máximo de 4.000 tokens de entrada y 1.000 de salida
por solicitud, sin búsquedas ni herramientas de pago:

- Entrada: 800.000 tokens × 0,25 USD/millón = 0,20 USD.
- Salida: 200.000 tokens × 1,50 USD/millón = 0,30 USD.
- Coste de inferencia máximo bajo estos supuestos: 0,50 USD.
- Triple del coste: 1,50 USD; con un descuento del 50 %, 0,75 USD, antes de otros costes.

El precio comercial en euros debe considerar la conversión de divisa, infraestructura,
impuestos, comisiones, soporte y cambios de precios. El margen real no está garantizado por
este cálculo. Documentos largos, historial de chat, reintentos y tokens de razonamiento
también cuentan. El límite debe aplicarse en el servidor, con reservas atómicas para llamadas
concurrentes y facturación de intentos que consuman proveedor; un límite solo por número de
solicitudes no garantiza el coste. El tope de entrada debe incluir archivos y contexto completo.

Existe un límite de 200 reservas mensuales por usuario en la base de datos. La selección de
usuarios y la integración con el cobro todavía no están implementadas. No activar ni cobrar el
módulo hasta probar todos los controles y los flujos reales.

Una función interna calcula la ampliación de IA para un ciclo pagado conocido y distingue una
reactivación ya pagada. Los administradores pueden consultar esa estimación; una futura reserva
debe volver a comprobarla bajo el bloqueo de la empresa antes de cobrar. La consulta no crea
pagos ni activa accesos.

## Estado de la integración

El adaptador de servidor usa el modelo estable `gemini-3.1-flash-lite`, cuenta el contexto
antes de generar, limita el razonamiento a `minimal`, solicita una sola respuesta y rechaza
respuestas truncadas o que no cumplan los esquemas. `minimal` reduce el razonamiento, pero no
garantiza que se desactive ni constituye por sí solo un límite exacto de coste. El recuento
del proveedor no incluye el esquema de respuesta, por lo que los 3.000 tokens contados
del adaptador no son un límite garantizado de facturación. El modelo está anunciado para
retirada el 7 de mayo de 2027; hay que revisar el sustituto antes de esa fecha.

El endpoint exige sesión y una reserva de consumo. La función de base de datos que autoriza y
reserva ya está desplegada; las asignaciones solo pueden gestionarse desde código de confianza.
La interfaz de gastos y presupuestos permanece inaccesible sin una asignación válida. En
PostgreSQL se comprobó que dos reservas solapadas respetan la última petición disponible:
la segunda esperó al bloqueo y recibió la respuesta de límite. Falta implementar la activación
por usuario y la facturación. Tampoco se ha probado con una clave real. No debe exponerse a
clientes hasta completar esos controles.
La clave debe configurarse solo en el entorno del servidor, nunca con el prefijo `VITE_`.
Antes de enviar documentos reales hay que revisar las condiciones de protección de datos y
usar una cuenta de pago: el tratamiento del contenido difiere en el nivel gratuito.
