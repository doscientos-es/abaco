# Catálogo público de precios

**Superadmin → Planes y precios** publica el catálogo general de Ábaco. Al guardar un plan se actualizan juntos su nombre, público, beneficio y precios mensuales por tramo. La cuota anual se calcula en la base de datos. `/precios` lee ese mismo catálogo sin requerir una cuenta y vuelve a consultarlo al abrirse; publicar precios no requiere desplegar de nuevo el frontend.

La sección **Empresas → Suscripción** es distinta: los precios pactados y el IVA de cada empresa no se publican. Los cambios del catálogo general tampoco modifican las cuotas vigentes ni los acuerdos ya pactados.

## Integración con la futura landing

- Consultar `billing_catalog` en la API pública de Supabase, incluyendo su relación `billing_plan_display`. Usar un cliente con acceso anónimo, sin credenciales privilegiadas ni consultas a empresas o suscripciones.
- Usar `plan` y `seats` para identificar el tramo; los importes están en céntimos y no incluyen IVA. Para Autónomo, Equipo pequeño y Equipo grande, `monthly_cents` y `yearly_cents` son los totales del plan. Para Enterprise, `monthly_cents` y `yearly_cents` son el precio base: calcular el total mensual como `monthly_cents + seat_monthly_cents × seats`, y el anual como `yearly_cents + seat_monthly_cents × seats × 10`. El plan empieza en 16 plazas. Tomar los textos de `name`, `audience` y `benefit` desde `billing_plan_display`.
- Los módulos opcionales son una cuota fija por empresa, en `billing_module_catalog`; excluir de la oferta adicional aquellos módulos incluidos en el plan seleccionado.
- Leer en tiempo de ejecución o con revalidación de caché, no solo al compilar la landing. Si la consulta falla, mostrar un enlace a `/precios` en vez de inventar un importe o mantener una copia manual.
