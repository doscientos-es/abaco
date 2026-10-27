# Ábaco

Presupuestos y cobros para autónomos y pequeñas empresas de instalaciones.
Un producto de Doscientos construido con React, Vite, TanStack Router y Supabase.

## Enfoque del producto

Prepara presupuestos, facilita la respuesta de tu cliente y controla lo pendiente
de cobrar. El primer resultado útil de la prueba es enviar un presupuesto real,
no completar una configuración extensa.

- Clientes y catálogo de materiales y mano de obra.
- Presupuestos y facturas; envío por WhatsApp y correo.
- Aceptación o rechazo desde el enlace del cliente, con nombre y fecha registrados.
- Seguimiento de facturas y cobros pendientes; contabilidad básica.

El [plan comercial](docs/COMMERCIAL_PLAN.md) define el cliente inicial, los límites
de la oferta, los escenarios económicos y el piloto de captación y retención.
Las cifras de mercado y los tickets previstos son hipótesis, no resultados medidos.

## Oferta vigente

Todos los planes incluyen las mismas funciones; solo cambia el tamaño del equipo,
incluido el propietario. Precios sin IVA:

| Plan     | Personas | Mensual | Anual |
| -------- | -------: | ------: | ----: |
| Autónomo |        1 |    20 € | 200 € |
| Equipo   |  Hasta 5 |    34 € | 340 € |
| Empresa  | Hasta 15 |    54 € | 540 € |

Prueba de 14 días, hasta 15 personas, sin tarjeta ni cobro automático al terminar.
El pago anual se cobra de una vez. El catálogo se define en
`src/features/billing/domain/plans.ts`; precios y límites deben mantenerse alineados
con la base de datos. Redsys tramita el cobro de la suscripción de Ábaco.

## Desarrollo

Desde este directorio, con las versiones de Node y pnpm indicadas en `package.json`:

1. Instala las dependencias declaradas con `pnpm install --frozen-lockfile`.
2. Configura las variables públicas de Supabase para conectar el entorno autorizado.
3. Ejecuta `pnpm dev` para iniciar la aplicación.

En una SPA de Vite, `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son
visibles en el navegador. El acceso a los datos depende de autenticación y políticas
RLS (seguridad por filas). Nunca añadas service role, certificados, claves de firma
ni secretos de proveedores a una variable `VITE_*`.

## Estructura

| Área                  | Propósito                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `src/app`             | Inicialización de Query, router y shell; compone las features.                                |
| `src/routes`          | Rutas y validación de URL; `routeTree.gen.ts` es generado.                                    |
| `src/features`        | Auth, onboarding, clientes, catálogo, presupuestos, facturas, contabilidad, planes y ajustes. |
| `src/shared`          | Dominio compartido, marca, store y adaptadores comunes.                                       |
| `supabase/migrations` | Esquema, precios, permisos y políticas de acceso versionados.                                 |
| `supabase/functions`  | Operaciones de backend, incluido el cobro de suscripciones.                                   |

La URL pertenece a TanStack Router, la caché remota a TanStack Query y las
primitivas visuales a `@doscientos/ui`. Mantener los permisos y límites de cada
feature; no conectar operaciones privilegiadas directamente desde componentes.

## Validación

El contrato completo es `pnpm quality`, también para agentes y CI. No eliminar
checks para ocultar incompatibilidades ni aplicar cambios a datos reales para validar copy.

- `pnpm format:check`: formato compartido.
- `pnpm lint`: reglas de React/Vite y capas de features.
- `pnpm structure:check`: estructura y nombres.
- `pnpm typecheck`: contrato TypeScript estricto.
- `pnpm test`: pruebas de dominio, aplicación y presentación.
- `pnpm quality`: novedades y todos los checks anteriores.
- `pnpm build`: compilación estática de Vite y generación del árbol de rutas.

Revisar `.githooks/` y ejecutar `pnpm hooks:install` una vez por clon para activar
el pre-commit de `pnpm quality:quick` (formato y lint, sin fixes). Rehúsa reemplazar
hooks existentes. CI verifica el contenido del commit; los required checks de
GitHub se configuran aparte.

## Versiones y novedades de Ábaco

- Tras pasar CI, cada push a `main` aumenta automáticamente el patch de
  `package.json`, genera las novedades, crea un commit `chore(release): vX.Y.Z`
  y etiqueta la versión. No publica la aplicación en npm.
- Como en los módulos, un cambio manual de versión se respeta. Para preparar
  una minor o major, usa `npm version minor --no-git-tag-version --ignore-scripts`
  o su equivalente con `major` antes de enviar los cambios.
- GitHub Actions necesita permiso de escritura en el repositorio y la rama
  debe permitir el commit de release del bot. Si `main` avanza durante la
  validación, se rechaza la release obsoleta.
- `@doscientos/changelog` genera `CHANGELOG.md` y
  `src/shared/lib/changelog.json` desde Git. Ambos se versionan y no se editan
  a mano. Usa `pnpm changelog:sync` y comprueba con `pnpm changelog:check`.
- Usa Conventional Commits con descripciones útiles para quien usa el producto:
  `feat` aparece en Nuevas funciones, `fix` en Correcciones y `perf` en Mejoras.
  No incluyas credenciales ni información privada en los mensajes.
- `dev` y `build` sincronizan las novedades. En clones superficiales, `--soft`
  conserva los archivos versionados; CI obtiene todo el historial Git.
- Ajustes → Novedades muestra el historial paginado. Los commits que todavía
  no tienen una release aparecen como «Sin publicar», no como cambios desplegados.
  El footer de Ajustes muestra la versión del `package.json` de ese build.
