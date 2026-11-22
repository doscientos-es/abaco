# Catálogo público de precios

**Superadmin → Planes y precios** administra el catálogo de Ábaco. La oferta pública es `standard`, con una cuota base y precio por persona adicional. Los planes anteriores se conservan para contratos existentes, pero no se ofrecen a nuevos clientes. `/precios` consulta el catálogo sin requerir una cuenta.

La sección **Empresas → Suscripción** es distinta: los precios pactados y el IVA de cada empresa no se publican. Los cambios del catálogo general tampoco modifican las cuotas vigentes ni los acuerdos ya pactados.

## Integración con la futura landing

- Consultar `billing_catalog` en la API pública de Supabase, incluyendo su relación `billing_plan_display`. Usar un cliente con acceso anónimo, sin credenciales privilegiadas ni consultas a empresas o suscripciones.
- Usar exclusivamente la fila `plan = standard` de `billing_catalog` para la oferta pública. Los importes están en céntimos y no incluyen IVA. Para `n` personas entre 1 y 200, el total mensual es `monthly_cents + seat_monthly_cents × (n − 1)` y el anual es `yearly_cents + seat_monthly_cents × (n − 1) × 12`. La primera persona está incluida; `yearly_cents` equivale a 10 cuotas base mensuales. Tomar los textos de `billing_plan_display`.
- Los módulos opcionales son una cuota fija por empresa, en `billing_module_catalog`. Solo ofrecer los módulos con estado `pilot`; los módulos `planned` aún no están disponibles.
- Leer en tiempo de ejecución o con revalidación de caché, no solo al compilar la landing. Si la consulta falla, mostrar un enlace a `/precios` en vez de inventar un importe o mantener una copia manual.
