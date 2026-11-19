# Catálogo público de precios

**Superadmin → Planes y precios** publica el catálogo general de Ábaco. Al guardar un plan se actualizan juntos su nombre, público, beneficio y precios mensuales por tramo. La cuota anual se calcula en la base de datos. `/precios` lee ese mismo catálogo sin requerir una cuenta y vuelve a consultarlo al abrirse; publicar precios no requiere desplegar de nuevo el frontend.

La sección **Empresas → Suscripción** es distinta: los precios pactados y el IVA de cada empresa no se publican. Los cambios del catálogo general tampoco modifican las cuotas vigentes ni los acuerdos ya pactados.

## Integración con la futura landing

- Consultar `billing_catalog` en la API pública de Supabase, incluyendo su relación `billing_plan_display`. Usar un cliente con acceso anónimo, sin credenciales privilegiadas ni consultas a empresas o suscripciones.
- Usar los campos `plan` y `seats` para identificar el tramo; mostrar `monthly_cents` o `yearly_cents` tal como llegan (céntimos, sin IVA), y tomar los textos de `name`, `audience` y `benefit`. Si solo se muestra un «desde», seleccionar el menor precio mensual del catálogo aplicable.
- Leer en tiempo de ejecución o con revalidación de caché, no solo al compilar la landing. Si la consulta falla, mostrar un enlace a `/precios` en vez de inventar un importe o mantener una copia manual.
