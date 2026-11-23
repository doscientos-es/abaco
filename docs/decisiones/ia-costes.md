# IA: cálculo inicial de costes

Esta es una estimación para diseñar el módulo, no una tarifa publicada ni una cuota implementada.
La calidad, el consumo real y la disponibilidad del modelo deben medirse antes de cobrar.

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

El precio comercial en euros necesita conversión de divisa y considerar infraestructura,
impuestos, comisiones, soporte y cambios de precios. El margen real no está garantizado por
este cálculo. Documentos largos, historial de chat, reintentos y tokens de razonamiento
también cuentan. El límite debe aplicarse en el servidor, con reservas atómicas para llamadas
concurrentes y facturación de intentos que consuman proveedor; un límite solo por número de
solicitudes no garantiza el coste. El tope de entrada debe incluir archivos y contexto completo.

La selección de usuarios, la integración con el cobro y estos límites todavía no están
implementados. No activar ni cobrar el módulo hasta probar esos controles y los flujos reales.

## Estado de la integración

El adaptador de servidor usa el modelo estable `gemini-3.1-flash-lite`, cuenta el contexto
antes de generar y rechaza respuestas truncadas o que no cumplan los esquemas. El recuento
del proveedor no incluye el esquema de respuesta, por lo que los 3.000 tokens contados
del adaptador no son un límite garantizado de facturación. El modelo está anunciado para
retirada el 7 de mayo de 2027; hay que revisar el sustituto antes de esa fecha.

El adaptador no está conectado a la aplicación: faltan autorización por usuario, reservas
de consumo concurrentes, facturación por asiento y los dos flujos de interfaz. Tampoco
se ha probado con una clave real. No debe exponerse a clientes hasta completar esos controles.
La clave debe configurarse solo en el entorno del servidor, nunca con el prefijo `VITE_`.
Antes de enviar documentos reales hay que revisar las condiciones de protección de datos y
usar una cuenta de pago: el tratamiento del contenido difiere en el nivel gratuito.
