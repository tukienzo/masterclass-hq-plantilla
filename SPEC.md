# SPEC · Masterclass HQ (plantilla) · contrato del backend

> Fuente única para implementar el backend **sin volver a leer el frontend**. Sale de los diez análisis de
> `_analisis/01..10` (cada afirmación de forma tiene ahí su `archivo:línea`) y de la documentación vigente de
> Netlify, Meta y Supabase consultada el 27/10/2026. Donde el frontend no alcanza para decidir, la decisión está
> tomada acá y anotada en §13 (Preguntas abiertas) con el valor por defecto elegido.
>
> Después de implementar, el contrato se puso al día con el código (27/10/2026): donde dicen distinto, manda
> `netlify/lib/` (y `netlify/functions/`) y este documento se corrige. El detalle de cada cambio está en el cuerpo, en su
> sección; §15 es solo el registro corto, con un link a cada una.
>
> Convenciones: `MHQ` = respuesta de `/api/app {accion:'inicio'}` (en el navegador, `window.MHQ`). `DATA` = respuesta de
> `GET /api/panel`. "Fila" = una agenda del pipeline tal como la recibe el frontend. Todos los textos de error que ve
> la persona van en castellano rioplatense, cortos.

## Índice

1. Decisiones (arquitectura y hechos verificados de Netlify)
2. Estructura del repo
3. Variables de entorno
4. Modelo de datos (colecciones de `mhq_docs`)
5. Sesión, códigos y roles
6. Librería compartida (paquete 0): firmas exactas
7. Endpoints, función por función
8. Integraciones externas
9. Cambios en el frontend
10. Semilla de demo
11. Plan de pruebas
12. Paquetes de trabajo
13. Preguntas abiertas y valores por defecto elegidos
14. Revisión de completitud (inventario verificado, huecos llenados R-01 a R-12, estados vacíos, sanitización)
15. Cambios después de la implementación (27/10/2026): qué cambió respecto de la primera versión del contrato

---

## 1. Decisiones

### 1.1 Arquitectura (decidida; acá solo se precisa)

| # | Decisión | Detalle |
|---|---|---|
| D1 | Hosting en **Netlify** | Estáticos desde `public/` (el frontend descargado, intacto salvo las ediciones de §9). Backend = Netlify Functions en `netlify/functions/*.mjs`, sintaxis moderna `export default async (req, context) => Response`. Las rutas `/api/*` se declaran con `export const config = { path: '/api/<nombre>' }`. **No** hay redirect `/api/*` en `netlify.toml`. |
| D2 | Código compartido en `netlify/lib/` | Fuera de `netlify/functions/` para que Netlify no lo despliegue como funciones; el bundler (esbuild) sigue los `import`. |
| D3 | Almacenamiento = **una tabla de documentos** | Producción: Supabase Postgres por PostgREST (`fetch` + clave de servicio) sobre `mhq_docs(col, id, data jsonb, creado, actualizado)`. Local/pruebas: archivos JSON en `.datos/`. Se elige con `ALMACEN`. |
| D4 | Acceso con **código personal** | `XXXX-XXXX` por persona, guardado solo como HMAC. Cookie de sesión firmada (HMAC-SHA256), `HttpOnly; SameSite=Lax; Path=/` y `Secure` en https. Arranque con `CODIGO_INICIAL`. |
| D5 | Integraciones **opcionales** | Sin conectar, cada endpoint devuelve la forma que el frontend ya entiende como "no conectado" o vacío (detallada endpoint por endpoint). Los secretos vienen de variables de entorno o de la pantalla Integraciones (cifrados en la base) y **nunca** vuelven al navegador (solo `…últimos4`). |
| D6 | Desarrollo local sin netlify-cli | `scripts/dev.mjs` (Node puro) sirve `public/`, enruta por `config.path` y por `/.netlify/functions/<archivo>`, y emula las funciones background (202 + ejecución asíncrona). También funciona `netlify dev` si se prefiere. |
| D7 | Plantilla genérica | Nombre, color, moneda, zona, país, closers, programas, comisiones y copy del webinar salen de configuración o datos. Ningún nombre del negocio original, de otros negocios ni de personas reales en el código (§9 lista las ediciones; §14.4, la verificación). |
| D8 | El frontend no se toca salvo §9 | Las rarezas del frontend (respuesta de `GET` y `POST` de agendas-sync con formas distintas, `hoy` como mes en el CRM, `ok:true` obligatorio en el pipeline, etc.) se respetan en el servidor. |
| D9 | Una sola sesión por request, **chequeo de rol en cada función** | "Esconder no es seguridad": cada función vuelve a validar la cookie y el rol (`requerir(req, roles)`), y cada acción tiene su lista de roles (§5.4). |
| D10 | Cálculos | El servidor calcula lo que el frontend espera calculado (proyección, agregados de registros, cruces registro↔agenda, KPIs del leaderboard, atribución por UTM, perfiles de IA). Todo lo demás lo calcula el navegador y el servidor **no** lo manda. |

Decisiones derivadas (cambian detalles, no el rumbo):

- **D11 · `salud` e `icp-generar-background` NO declaran `config.path`.** Netlify documenta que al poner un `path` la función deja de existir en `/.netlify/functions/<nombre>` (ver 1.2), y el frontend llama a esas dos por la ruta por defecto. Las demás funciones usan `config.path`.
- **D12 · Background por sufijo de archivo.** `netlify/functions/icp-generar-background.mjs` (sin `config.path`). El nombre de la función queda exactamente `icp-generar-background`, que es la URL que pide `icp.js:311`.
- **D13 · Dos funciones programadas** (`schedule`): `agendas-sync-cron` cada 15 min (la UI promete "solas se traen cada 15 minutos") y `envios-cron` cada 10 min (reintentos de ActiveCampaign y Meta CAPI: la UI promete "se reintentan").
- **D14 · Producción exige Supabase.** El driver de archivos sirve solo en local: en Netlify el disco no persiste. Si corre en Netlify (`enNetlify()`, §6.4) con `archivo`, **toda** operación del almacén tira `HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Netlify y no uses ALMACEN=archivo')` (§6.2): la persona ve qué falta en vez de un sitio que parece andar y no guarda nada.
- **D15 · Modo demo de Meta.** Con `DEMO_META=1` la integración de Meta se considera conectada y `/api/meta-ads` devuelve datos sintéticos deterministas (para que la semilla pinte todas las pantallas de Ads sin cuenta real). Nunca se manda nada a Meta en ese modo.
- **D16 · SDK oficial para Claude.** El ICP con IA usa `@anthropic-ai/sdk` (no `fetch` a mano), modelo por defecto `claude-opus-5-5`, salida estructurada con `output_config.format` y `fallbacks: "default"`. El resto de las APIs externas (Supabase, Meta, Calendly, iClosed, ActiveCampaign, Fathom) va con `fetch`.
- **D17 · Dependencias npm: solo dos.** `@anthropic-ai/sdk` y `@netlify/functions` (para `purgeCache` y los tipos). Se instalan con `npm install` (la versión vigente) y se commitea el `package-lock.json`.

### 1.2 Hechos de Netlify verificados (27/10/2026)

| Hecho | Cita / valor | Fuente |
|---|---|---|
| Sintaxis | "A function file has a default export with a handler that receives a web platform `Request` and a Netlify-specific `context`, and returns a web platform `Response`." Carpeta por defecto `netlify/functions/`; `hello.mjs`, `hello/hello.mjs` o `hello/index.mjs` crean la función `hello`. | https://docs.netlify.com/build/functions/get-started/ |
| Ruta por defecto | "By default, every function is available at `https://<YOUR DOMAIN>/.netlify/functions/<FUNCTION NAME>`." | https://docs.netlify.com/build/functions/configuration/ |
| **`path` reemplaza la ruta por defecto** | "**When you set a custom `path`, the function is only available at that path — not at the default `/.netlify/functions/<name>` URL.**" `path` acepta string o array y sintaxis URLPattern (`/sale/*`, `/item/:sku`); `method` restringe métodos; `preferStatic`, `excludedPath`. | https://docs.netlify.com/build/functions/configuration/ |
| Límites | Región por defecto `cmh`; memoria 1024 MB; **sincrónica 60 s**; **programada 30 s**; **background 15 min**; payload sincrónico 6 MB (binarios ≈4,5 MB); payload background 256 KB. | https://docs.netlify.com/build/functions/configuration/ |
| Runtime de Node | El de la build (debe ser un runtime de AWS Lambda vigente); si no, Node 24 por defecto. Se puede fijar con `AWS_LAMBDA_JS_RUNTIME` desde la UI (no desde `netlify.toml`). | https://docs.netlify.com/build/functions/configuration/ |
| Background | "Before `config.background` was introduced, background mode was enabled by naming the function file with a `-background` suffix. This convention is still fully supported". El cliente recibe un **`202` vacío** enseguida; corre hasta 15 min; misma firma `(req, context)`. **Si la invocación devuelve error, Netlify reintenta a 1 min y otra vez a los 2 min** → la función background tiene que atrapar todo y no tirar. Disponible en todos los planes por créditos (Free incluido). | https://docs.netlify.com/build/functions/background-functions/ |
| Programadas | `export const config = { schedule: "@hourly" }` o cron; **UTC**; **30 s**; "You can't invoke scheduled functions directly with a URL"; solo corren en el deploy publicado (no en previews); todos los planes. | https://docs.netlify.com/build/functions/scheduled-functions/ |
| `context` | `context.ip` (IP del cliente), `context.geo.country.code` (ISO), `context.cookies.get/set/delete`, `context.waitUntil(promise)` (corre después de responder; funciones desplegadas desde el 20/03/2025), `context.params`, `context.site.url`, `context.deploy.context`, `context.requestId`. | https://docs.netlify.com/build/functions/api/ |
| Variables de entorno | Se leen con `process.env.X`; con scopes, tienen que incluir **Functions**; "**environment variables declared in a Netlify configuration file (`netlify.toml`) are not available to serverless functions**"; un cambio de valor requiere un deploy nuevo. | https://docs.netlify.com/build/functions/environment-variables/ |
| Caché del CDN | Las respuestas de funciones **no** se cachean por defecto. `Netlify-CDN-Cache-Control: public, durable, s-maxage=60, stale-while-revalidate=300` las cachea (`durable` = caché compartida entre nodos). `Netlify-Cache-Tag` + `purgeCache({ tags })` de `@netlify/functions` invalidan a demanda (máx. 2 purgas cada 5 s por tag). | https://docs.netlify.com/build/caching/caching-overview/ |

Otros hechos externos verificados:

| Hecho | Valor | Fuente |
|---|---|---|
| Versión de la Graph/Marketing API de Meta | Última **v26.0** (29/07/2026); Marketing API v24.0 venció el 06/10/2026; v25.0 vigente. Por defecto `META_API_VERSION=v26.0`. | https://developers.facebook.com/docs/graph-api/changelog |
| Claves de Supabase | Las claves nuevas (`sb_secret_…`) van en el header **`apikey`**, no en `Authorization: Bearer`. La clave secreta saltea todas las políticas RLS; los GRANT de tabla siguen aplicando. La `service_role` vieja es un JWT. | https://supabase.com/docs/guides/api/api-keys |
| iClosed | `GET https://public.api.iclosed.io/v1/eventCalls?eventType=UPCOMING\|PAST&limit=50&page=N` con `Authorization: Bearer <key>`; respuesta en `data.eventCalls[]`; la página 0 es lo más nuevo; devuelve 429 con ráfagas. | Integración que ya funciona en producción en el negocio original (no hay documentación pública a mano). |
| Fathom | `https://api.fathom.ai/external/v1/…` con header `X-Api-Key`. | Ídem. |
| Claude | Modelo por defecto `claude-opus-5-5`; salida JSON estricta con `output_config: { format: { type: 'json_schema', schema } }`; `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`; chequear `stop_reason === 'refusal'` antes de leer `content`; `GET /v1/models` (`client.models.list()`) para probar una clave. | Skill `claude-api` (referencia cacheada 06/10/2026). |

---

## 2. Estructura del repo

Cada archivo, una línea. **(P#)** = paquete dueño (§12).

```
masterclass-hq-plantilla/
├── SPEC.md                                   este contrato
├── README.md                          (P8)   guía para que un negocio monte su webinar con la plantilla
├── GUIA-WEBINAR.md                    (P8)   la guía paso a paso para montar y operar el webinar, sin programar
├── CREDITOS.md                        (P8)   de dónde salen el diseño y el frontend (fuera del grep de §14.4)
├── package.json                       (P0)   "type":"module", engines node>=22.12.0, scripts dev/semilla/acceso/probar, 2 dependencias
├── package-lock.json                  (P0)   generado por npm install
├── .nvmrc                             (P0)   "22"
├── .gitignore                         (P0)   node_modules/, .datos*/, .env, .env.*, !.env.ejemplo, .netlify/, _original/, _analisis/, *.log, .DS_Store (ver R-01; .datos*/ cubre cualquier DATOS_DIR de prueba)
├── .env.ejemplo                       (P0)   todas las variables de §3 con valores de ejemplo
├── netlify.toml                       (P0)   publish/functions, esbuild, rewrite de /gracias, headers
├── supabase/
│   └── schema.sql                     (P0)   tabla mhq_docs, índices, RLS, 7 funciones RPC, grants
├── public/                                   frontend descargado (verbatim + §9)
│   ├── index.html · gracias.html · css/ · js/          landing pública y página de gracias
│   └── app/  index.html · css/ · js/                   la app interna (Masterclass HQ)
├── netlify/
│   ├── functions/
│   │   ├── acceso.mjs                 (P1)   /api/acceso: entrar, yo, salir
│   │   ├── app.mjs                    (P0)   /api/app: despachador de acciones (importa lib/app/*)
│   │   ├── panel.mjs                  (P0)   /api/panel: GET pipeline + despachador de POST (importa lib/panel/*)
│   │   ├── db.mjs                     (P7)   /api/db: colecciones genéricas
│   │   ├── crm.mjs                    (P4)   /api/crm: CRM de ventas por mes
│   │   ├── meta-ads.mjs               (P5)   /api/meta-ads: 3 modos (diario, anuncios, resumen)
│   │   ├── icp.mjs                    (P6)   /api/icp: UTM's, trazabilidad, ICP y estado de la IA
│   │   ├── icp-generar-background.mjs (P6)   SIN path: /.netlify/functions/icp-generar-background (15 min)
│   │   ├── tablero.mjs                (P2)   /api/tablero: webinars con proyección y agregados
│   │   ├── agendas-sync.mjs           (P3)   /api/agendas-sync: GET estado, POST sincronizar ya
│   │   ├── agendas-sync-cron.mjs      (P3)   schedule */15: sync iClosed + Calendly
│   │   ├── envios-cron.mjs            (P2)   schedule */10: reintentos AC + CAPI y limpieza de contadores
│   │   ├── salud.mjs                  (P7)   SIN path: /.netlify/functions/salud
│   │   ├── publico.mjs                (P2)   /api/publico: webinar activo para la landing (cache 60 s)
│   │   └── registro.mjs               (P2)   /api/registro: alta (paso 1) y respuestas (paso 2)
│   └── lib/
│       ├── http.mjs                   (P0)   json/error/manejar/leerJSON/HttpError/ipDe
│       ├── almacen.mjs                (P0)   fachada: elige driver y expone la API de §6.2
│       ├── almacen-supabase.mjs       (P0)   driver PostgREST
│       ├── almacen-archivo.mjs        (P0)   driver JSON en .datos/
│       ├── sesion.mjs                 (P0)   cookie firmada, códigos, requerir(req, roles), firmar()
│       ├── config.mjs                 (P0)   negocio(), opciones(), ESTADOS, webinar activo, env()
│       ├── fechas.mjs                 (P0)   zona horaria: hoy, mes, día local, aUTC con DST, sumarDias
│       ├── normalizar.mjs             (P0)   norm, normUtm, slug, monto, email, digitos, idSeguro, nuevoId
│       ├── cifrado.mjs                (P0)   AES-256-GCM para secretos de integraciones
│       ├── telefono.mjs               (P0)   los 20 países de la landing y normalización a E.164
│       ├── integraciones/
│       │   ├── estado.mjs             (P0)   leer/guardar/borrar integración, env vs guardada, IntegracionEstado
│       │   ├── meta-ads.mjs           (P5)   Marketing API: probar, cuentas, píxeles, insights, demo
│       │   ├── meta-capi.mjs          (P2)   Conversions API: Lead, CompleteRegistration, evento de prueba
│       │   ├── activecampaign.mjs     (P2)   probar/listas, contacto + lista + etiqueta
│       │   ├── calendly.mjs           (P3)   probar, eventos e invitados → agendas
│       │   ├── iclosed.mjs            (P3)   probar, eventCalls → agendas
│       │   ├── fathom.mjs             (P7)   probar y listar equipos
│       │   └── llm.mjs                (P6)   probar clave y pedir perfiles a Claude (SDK)
│       ├── app/
│       │   ├── webinars.mjs           (P1)   acciones inicio, webinar, proyectar, guardarWebinar, activar, borrarWebinar, tarea
│       │   ├── personas.mjs           (P1)   acciones personas, persona
│       │   ├── registros.mjs          (P2)   acción registros
│       │   └── integraciones.mjs      (P7)   acciones integraciones, conectar, desconectar, probar
│       ├── panel/
│       │   ├── agendas.mjs            (P3)   GET pipeline, editar campo, add, adel
│       │   └── finanzas.mjs           (P4)   crmsync, finanzasget, liqpago, comisiones
│       ├── webinars.mjs               (P1)   leer/listar webinars, inicio ISO, vista pública
│       ├── proyeccion.mjs             (P1)   parsear entrada y calcular la "cuenta al revés"
│       ├── checklist.mjs              (P1)   plantilla de tareas fases 0 a 7, progreso, correr fechas
│       ├── landing.mjs                (P1)   LANDING_DEFECTO, parsear el form del editor, versión pública
│       ├── registros.mjs              (P2)   cargar, calificar, resumir (porDia, porFuente, envíos)
│       ├── envios.mjs                 (P2)   efectos de un registro (AC + CAPI) y cola de reintentos
│       ├── pipeline.mjs               (P3)   agendas → filas, cruce con registros, personas (union-find)
│       ├── crm-core.mjs               (P4)   kpis, leaderboard, armarCierre, crmsync
│       ├── atribucion.mjs             (P5)   registro → campaña/anuncio por UTM
│       └── icp-core.mjs               (P6)   agregados de /api/icp y conteo en vivo de perfiles
└── scripts/
    ├── dev.mjs                        (P0)   servidor local: estáticos + funciones + background + cron manual
    ├── semilla.mjs                    (P8)   negocio ficticio de demo (§10)
    ├── nuevo-acceso.mjs               (P8)   crea una persona o regenera su código y lo imprime una vez
    └── probar.mjs                     (P8)   pruebas de contrato contra el servidor local (§11)
```

`netlify.toml` (P0):

```toml
[build]
  publish = "public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/gracias"
  to = "/gracias.html"
  status = 200

[[headers]]
  for = "/app/*"
  [headers.values]
    X-Frame-Options = "DENY"
    Referrer-Policy = "same-origin"
    X-Content-Type-Options = "nosniff"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
```

No hay `[build.environment]`: Netlify no se lo pasa a las funciones (1.2). Las variables van por la UI o `netlify env:set`.

---

## 3. Variables de entorno

Se leen con `process.env`. En local, `scripts/dev.mjs` carga `.env` (formato `CLAVE=valor`, `#` comentario). **Obligatoria** = la app no arranca bien sin ella.

### 3.1 Núcleo

| Nombre | ¿Obligatoria? | Para qué | Ejemplo |
|---|---|---|---|
| `SESION_SECRETO` | **Sí** (≥ 32 caracteres) | HMAC de la cookie de sesión, de los códigos de acceso (`codigoHash`) y de la `firma` del registro. Cambiarlo invalida todas las sesiones **y todos los códigos**. | `7f3c…` (64 hex, `openssl rand -hex 32`) |
| `CIFRADO_SECRETO` | No | Clave AES-256-GCM de los secretos de integraciones. Si falta se deriva de `SESION_SECRETO` (`sha256(SESION_SECRETO + ':cifrado')`). | `a91e…` |
| `CODIGO_INICIAL` | Sí hasta crear la primera persona | Código del primer usuario `equipo` (§5.3). Formato `XXXX-XXXX`. | `ABCD-2345` |
| `ADMIN_NOMBRE` | No | Nombre de esa primera persona. Por defecto `Admin`. | `Ana Pérez` |
| `ALMACEN` | No | `supabase` o `archivo`. Por defecto `supabase` si hay `SUPABASE_URL`, si no `archivo`. **`archivo` es solo para local** (`scripts/dev.mjs` o `netlify dev`): desplegado en Netlify (`enNetlify()`, §6.4), cada pedido a una función da `500 {error:'Falta configurar Supabase: cargá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Netlify y no uses ALMACEN=archivo'}` (D14, §6.2). Los estáticos se sirven igual. `scripts/dev.mjs` pone `NETLIFY_DEV` y `NETLIFY_LOCAL` si no vienen, así en local el driver archivo anda. | `supabase` |
| `SUPABASE_URL` | Sí en producción | URL del proyecto. Sin ella (o sin la clave) con el driver `supabase`, cada operación tira `HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')`. | `https://abcd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí en producción | Clave secreta (`sb_secret_…`) o la `service_role` JWT vieja. Solo la usan las funciones. | `sb_secret_…` |
| `DATOS_DIR` | No | Carpeta del driver `archivo`. Por defecto `.datos` (relativa a la raíz del repo). | `.datos` |
| `PORT` | No | Puerto de `scripts/dev.mjs`. Por defecto `8888`. | `8888` |
| `SITIO_URL` | No | URL pública; solo la usan los scripts para imprimir el link `/app/#k=`. En funciones se usa `context.site.url` o el origen del request. | `https://mi-webinar.netlify.app` |

### 3.2 Negocio (todas opcionales; el documento `ajustes/negocio` las pisa campo por campo)

| Nombre | Por defecto | Para qué |
|---|---|---|
| `NEGOCIO_NOMBRE` | `Mi Negocio` | `cliente.nombre`: logo, gate, pie, landing, ©. |
| `NEGOCIO_COLOR` | `#3b82f6` | `cliente.color` (`#rrggbb`), acento de la landing y de la app. |
| `NEGOCIO_MONEDA` | `USD` | ISO 4217 válido para `Intl.NumberFormat` (se valida; si no, `USD`). |
| `NEGOCIO_ZONA` | `America/Argentina/Buenos_Aires` | Zona IANA (se valida). Define "hoy", el día de cada registro, `Fecha call`, el mes del CRM y el `inicio` público. |
| `NEGOCIO_PAIS` | `AR` | País por defecto del form de la landing y para normalizar teléfonos sin código. Uno de los 20 de §6.9. |
| `NEGOCIO_LOCALE` | `es-AR` | Se manda en `cliente.locale` (el frontend actual formatea con `es-AR` fijo). |
| `NEGOCIO_PREFIJO_TEL` | `549` si país AR; si no, el prefijo del país | `cliente.prefijoTel`: lo usa Ads → Audiencias para completar números locales de 10 dígitos (§9, E-17). |
| `WEBINAR_DURACION_MIN` | `180` | `duracionMin` por defecto de un webinar nuevo: la landing da la clase por terminada y el registro se cierra a `inicio + duracionMin`. |
| `WEBINAR_HORA` | `20:00` | Hora por defecto de un webinar nuevo. Llega al formulario como `inicio.cliente.horaPorDefecto` (§7.3.1). |

### 3.3 Integraciones (opcionales: lo cargado en Integraciones pisa a la variable, campo por campo)

| Nombre | Integración | Para qué |
|---|---|---|
| `META_TOKEN` | meta | Token de usuario del sistema (Business Manager). Permisos: `ads_read` para leer; para la Conversions API, el píxel asignado al usuario del sistema (o `ads_management`). |
| `META_CUENTA` | meta | `act_<id>` de la cuenta publicitaria. |
| `META_PIXEL` | meta | Id numérico del píxel (dataset). |
| `META_CAPI_TOKEN` | meta | Opcional: token de la Conversions API generado en el Administrador de eventos. Si falta, CAPI usa `META_TOKEN` (o el guardado). |
| `META_API_VERSION` | meta | Por defecto `v26.0`. |
| `DEMO_META` | meta | `1` = modo demo (D15). Nunca en producción real. |
| `CALENDLY_TOKEN` | calendly | Token personal de un admin de la organización. |
| `ICLOSED_API_KEY` | iclosed | API key. |
| `FATHOM_API_KEY` · `FATHOM_EQUIPO` | fathom | Key de un admin y nombre del equipo de los closers. |
| `ANTHROPIC_API_KEY` | ia | Clave de la API de Claude (solo para el ICP con IA). |
| `ICP_MODELO` | ia | Por defecto `claude-opus-5-5`. |
| `AC_URL` · `AC_KEY` · `AC_LISTA` | ac | URL de la API (`https://<cuenta>.api-us1.com`), key y id de la lista. |

### 3.4 Límites (opcionales)

| Nombre | Por defecto | Para qué |
|---|---|---|
| `REGISTRO_LIMITE_HORA` | `20` | Altas por IP por hora en `/api/registro` (después, `429 demasiados`). |
| `ACCESO_LIMITE` | `10` | Intentos fallidos de código por IP cada 15 min en `/api/acceso`. |
| `META_CACHE_S` | `300` | Segundos de caché del lado del servidor de cada consulta a Meta. |

---

## 4. Modelo de datos

### 4.1 La tabla

Un documento = una fila de `mhq_docs` con `(col, id)` como clave. Lo que el código ve es siempre
`doc = { ...data, id, creado, actualizado }` (`creado` y `actualizado` son ISO UTC que pone la base; si `data` trae
claves `id`, `creado` o `actualizado`, se descartan al escribir).

`supabase/schema.sql` (P0), completo:

```sql
-- Masterclass HQ · esquema de Supabase (SPEC §4.1)
-- Una sola tabla de documentos (col, id) → data jsonb. Se corre una vez en el SQL Editor del proyecto.
-- Las funciones solo las usa la clave secreta desde las Netlify Functions: anon y authenticated no entran.

create table if not exists public.mhq_docs (
  col         text        not null,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists mhq_docs_col_creado on public.mhq_docs (col, creado);
create index if not exists mhq_docs_w          on public.mhq_docs (col, (data->>'w'));
create index if not exists mhq_docs_mes        on public.mhq_docs (col, (data->>'mes'));
create index if not exists mhq_docs_email      on public.mhq_docs (col, (data->>'email'));
create index if not exists mhq_docs_codigo     on public.mhq_docs (col, (data->>'codigoHash'));

alter table public.mhq_docs enable row level security;      -- sin políticas: nadie entra con anon/authenticated
revoke all on public.mhq_docs from anon, authenticated;
grant all on public.mhq_docs to service_role;

-- merge superficial (jsonb ||): las claves nuevas pisan, los null pisan, las que no vienen se conservan
create or replace function public.mhq_fusionar(p_col text, p_id text, p_data jsonb)
returns setof public.mhq_docs language sql as $$
  insert into public.mhq_docs as d (col, id, data) values (p_col, p_id, p_data)
  on conflict (col, id) do update set data = d.data || excluded.data, actualizado = now()
  returning *;
$$;

-- lo mismo para varios ([{id, ...}], ids sin repetir: el JS deduplica antes)
create or replace function public.mhq_fusionar_varios(p_col text, p_docs jsonb)
returns setof public.mhq_docs language sql as $$
  insert into public.mhq_docs as d (col, id, data)
  select p_col, e->>'id', e - 'id' from jsonb_array_elements(p_docs) as e
  on conflict (col, id) do update set data = d.data || excluded.data, actualizado = now()
  returning *;
$$;

-- merge solo si el documento existe (nunca inserta) y cumple p_si = {"clave": ["texto", ...]}: para cada clave, el
-- valor actual como texto (coalesce(data->>clave, ''), así '' = vacío o ausente) tiene que estar en su lista.
-- El FOR UPDATE toma la fila: otro pedido a la misma fila espera y después ve lo ya escrito. [] = no se cumplió.
create or replace function public.mhq_fusionar_si(p_col text, p_id text, p_data jsonb, p_si jsonb)
returns setof public.mhq_docs language plpgsql as $$
declare
  v_data jsonb;
begin
  select d.data into v_data from public.mhq_docs d where d.col = p_col and d.id = p_id for update;
  if not found then return; end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_si, '{}'::jsonb)) as c(k, vals)
    where not (coalesce(v_data->>c.k, '') in (select jsonb_array_elements_text(c.vals)))
  ) then return; end if;
  return query
    update public.mhq_docs d set data = d.data || p_data, actualizado = now()
    where d.col = p_col and d.id = p_id
    returning d.*;
end;
$$;

-- merge de varios solo sobre los que existen ([{id, ...}], ids sin repetir): los que no están no se crean
create or replace function public.mhq_fusionar_varios_si_existen(p_col text, p_docs jsonb)
returns setof public.mhq_docs language sql as $$
  update public.mhq_docs as d set data = d.data || (e - 'id'), actualizado = now()
  from jsonb_array_elements(p_docs) as e
  where d.col = p_col and d.id = e->>'id'
  returning d.*;
$$;

-- reemplazo con bloqueo optimista: solo si data.v coincide (CRM)
create or replace function public.mhq_reemplazar_si(p_col text, p_id text, p_data jsonb, p_v int)
returns setof public.mhq_docs language sql as $$
  update public.mhq_docs set data = p_data, actualizado = now()
  where col = p_col and id = p_id and coalesce((data->>'v')::int, 0) = p_v
  returning *;
$$;

-- contador atómico (límites de intentos)
create or replace function public.mhq_incrementar(p_col text, p_id text, p_campo text, p_n numeric)
returns numeric language sql as $$
  insert into public.mhq_docs as d (col, id, data) values (p_col, p_id, jsonb_build_object(p_campo, p_n))
  on conflict (col, id) do update
    set data = d.data || jsonb_build_object(p_campo, coalesce((d.data->>p_campo)::numeric, 0) + p_n),
        actualizado = now()
  returning (data->>p_campo)::numeric;
$$;

-- borra los documentos de una colección no tocados desde antes de p_antes (limpieza de límites y caché)
create or replace function public.mhq_borrar_viejos(p_col text, p_antes timestamptz)
returns integer language sql as $$
  with b as (delete from public.mhq_docs where col = p_col and actualizado < p_antes returning 1)
  select count(*)::int from b;
$$;

revoke execute on function public.mhq_fusionar(text,text,jsonb), public.mhq_fusionar_varios(text,jsonb),
  public.mhq_fusionar_si(text,text,jsonb,jsonb), public.mhq_fusionar_varios_si_existen(text,jsonb),
  public.mhq_reemplazar_si(text,text,jsonb,int), public.mhq_incrementar(text,text,text,numeric),
  public.mhq_borrar_viejos(text,timestamptz) from public, anon, authenticated;
grant execute on function public.mhq_fusionar(text,text,jsonb), public.mhq_fusionar_varios(text,jsonb),
  public.mhq_fusionar_si(text,text,jsonb,jsonb), public.mhq_fusionar_varios_si_existen(text,jsonb),
  public.mhq_reemplazar_si(text,text,jsonb,int), public.mhq_incrementar(text,text,text,numeric),
  public.mhq_borrar_viejos(text,timestamptz) to service_role;
```

**Actualizar un proyecto que ya existe:** todo el archivo es `create or replace` / `if not exists`, así que se puede
volver a correr entero en el SQL Editor sin perder datos. Hay que hacerlo **antes** de desplegar código que use
`mhq_fusionar_si` o `mhq_fusionar_varios_si_existen` (sesión, pipeline, CRM): si la RPC no existe, PostgREST responde
404 y el driver lo convierte en `Error('Base: 404 …')` (un 500 para la persona).

### 4.2 Reglas generales de ids y tipos

- **Ids generados** por el servidor: `nuevoId(prefijo)` = prefijo + `Date.now().toString(36)` + 6 caracteres `[a-z0-9]` al azar.
  Siempre `[A-Za-z0-9_-]` (el frontend los mete sin escapar en `onclick="fn('${id}')"`).
- **Ids que manda el cliente** (`/api/db`, evaluaciones, kpis, asistencia): se validan con `/^[A-Za-z0-9_-]{1,64}$/`;
  si no cumplen, `400 {error:'Id inválido'}`.
- Fechas de calendario: `'YYYY-MM-DD'` **en la zona del negocio**. Horas: `'HH:MM'` 24 h con cero adelante.
  Instantes: ISO UTC con `Z` (`Date.toISOString()`).
- Montos: `number` (o `''`/`null` cuando no hay). Porcentajes de proyección: 0–100. Tasas de KPIs del CRM: 0–1.

### 4.3 Colecciones internas (reservadas: `/api/db` responde 403 si se las pide)

#### `personas` — una por persona con acceso

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `u_…` | es el `uid` |
| `nombre` | string 2–60 | Para closers, **tiene que ser igual** al nombre del closer en iClosed/Calendly y en el pipeline (es la clave del cruce). Único entre activos (comparado con `norm`). |
| `rol` | `'equipo' \| 'cliente' \| 'closer'` | |
| `activo` | boolean | |
| `codigoHash` | string hex \| null | `HMAC-SHA256(SESION_SECRETO, 'codigo:' + normalizarCodigo(c))`. `null` = sin código vigente. |
| `sesionVer` | int ≥ 0 | Se incrementa para cerrar todas las sesiones de la persona. |
| `ultimoIngreso` | ISO \| null | |
| `v` | int ≥ 0 | Bloqueo optimista de `persona {codigo}` y `persona {baja}` (`reemplazarSiVersion`): dos cambios a la vez dan 409 en vez de devolver un código que ya no anda. Falta = 0. |

#### `webinars` — uno por webinar

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `'w' + AAAAMMDD + 4 [a-z0-9]` | ej. `w20261103k3x9` |
| `nombre` | string ≤ 120 | interno |
| `fecha` | `YYYY-MM-DD` | día del vivo, zona del negocio |
| `hora` | `HH:MM` | |
| `popup` | `{fecha, hora} \| null` | sesión pop-up de venta (opcional) |
| `formato` | uno de `opciones.formatos` | |
| `cierre` | uno de `opciones.cierres` | cómo se vende (no confundir con `landing.cierre`, que es un título) |
| `ventana` | int 1–60 | días de la ventana de cierre después del vivo. Defecto 10 |
| `etiqueta` | string slug ≤ 60 | etiqueta de ActiveCampaign. Defecto `webinar-<fecha>` |
| `duracionMin` | int 30–600 | Defecto `WEBINAR_DURACION_MIN` |
| `proyeccion` | `{[clave]: number}` | solo lo cargado (las 11 claves de §7.3.3); vacío = usa la vara |
| `tareas` | `Tarea[]` | embebidas (no hay colección aparte), ordenadas por fase |
| `landing` | `Landing` | §7.3.4 |
| `v` | int ≥ 0 | Bloqueo optimista de los cambios a un webinar (`reemplazarSiVersion`): se relee y reintenta con una espera corta al azar, hasta 12 veces (así varios tildes seguidos de la checklist entran todos); si no entra, `409 {error:'Alguien más estaba guardando este webinar: probá de nuevo'}`. |

`Tarea` = `{id: 't…', bloque: string, texto: string ≤ 200, vence: 'YYYY-MM-DD', hecha: boolean, offset: int|null}` (`offset` = días respecto del vivo; `null` en las tareas creadas a mano).

#### `ajustes` — documentos sueltos de configuración

| id | Contenido |
|---|---|
| `negocio` | Pisa la configuración de §3.2 campo por campo: `{nombre?, color?, moneda?, zona?, pais?, locale?, prefijoTel?, duracionMin?, horaPorDefecto?, vara?: {...}, formatos?: [], cierres?: [], roles?: {...}, listas?: {...}, medios?: [], capitalTramos?: [...], camposAgenda?: [], mapeoForm?: [...], origenesPauta?: []}`. No hay pantalla que lo edite: lo escriben la semilla o un script. Un valor que no valida cae en el valor por defecto (no en la variable de entorno); cada valor de `vara` se lee con `monto()` (§6.4). |
| `estado` | `{webinarActivo: string \| null}` |
| `arranque` | `{dueno: string, desde: ISO \| null}`: el candado de `primerIngreso` (§5.3). `dueno: ''` = libre. Lo toma un solo pedido a la vez con `fusionarSi`; vence a los 2 min |
| `agendas-borradas` | `{"<fuenteId>": ISO}`: las agendas de un calendario que alguien borró con `adel` (§7.4.6). El sync no las vuelve a crear (§7.5.4) |
| `semilla` | `{hoy: 'YYYY-MM-DD', cuando: ISO, ids: {"<colección>": [ids]}}`: el manifiesto de la demo (§10). Solo lo lee la semilla |
| `metas` | `{agendas?, presentadas?, calificadas?, unidades?, cierreGral?, cierreEf?, showUp?, aovTrato?, cash?, cuotas?, total?, objetivoMes?}` (globales, se **reemplazan** enteras) |
| `comisiones` | `{def: number, pct: {"<nombre del closer>": number}}` |
| `liq` | `{v, "YYYY-MM": {"<norm(closer)>": {monto, fecha, pct, por, t}}}`: un solo documento para todos los meses, escrito con `reemplazarSiVersion` sobre `v` (§7.7.3) |
| `sync-agendas` | `{cuando: ISO, iclosed: FuenteSync, calendly: FuenteSync}` (§7.5) |

#### `registros` — una persona anotada a un webinar

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `r_…` | es el `ref` del paso 1 |
| `w` | id de webinar | relación → `webinars.id` (puede quedar huérfano si el webinar se borra) |
| `creado` | ISO | (columna) |
| `dia` | `YYYY-MM-DD` | día local de `creado` en la zona del negocio (para `porDia` y rangos de Ads) |
| `nombre` | string 2–80 | |
| `email` | string minúsculas | |
| `pais` | ISO-2 | uno de los 20 |
| `whatsapp` | string E.164 con `+` | ej. `+5491155551234`. Nunca `null` (`''` si algo falla) |
| `tel8` | string | últimos 8 dígitos (para cruces) |
| `utm` | `{utm_source, utm_medium, utm_campaign, utm_content, utm_term}` | cada una con `normUtm`, `''` cuando falta |
| `eventId` | string | id del evento Lead (el que mandó el navegador) |
| `eventIdCR` | string \| null | `eventId + '-cr'` cuando se calificó |
| `fbp`, `fbc`, `url`, `referrer`, `ip`, `ua`, `paisGeo` | string | para la CAPI y reintentos |
| `respuestas` | `{[preguntaId]: textoOpcion}` | `{}` hasta el paso 2 |
| `respondio` | boolean | contestó el paso 2 |
| `calificado` | `true \| false \| null` | §7.12.3 |
| `ac` | `null \| {ok:true, t} \| {ok:false, error, t}` | estado del envío a ActiveCampaign (`null` = no corresponde o sin conectar) |
| `meta` | `null \| {ok:true, t} \| {ok:false, error, t}` | estado del envío del Lead a Meta CAPI |
| `metaCR` | igual | estado del envío del CompleteRegistration |

Derivados (no se guardan): `respondieron` = cantidad con `respondio`; `calificados` = cantidad con `calificado === true`.

#### `agendas` — el pipeline (una fila por llamada agendada)

Las claves son **literales** del frontend (mayúscula inicial, una con espacio). Se guardan así y salen así.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `ag_…` | sale como `_row` **y** `_id` (los dos iguales, string). Fijos donde dos escrituras a la vez tienen que caer en la misma fila: las del sync, `'ag_' + sha256(fuenteId)` (20 hex); un alta manual con email o teléfono, `'ag_' + sha256('alta'\|fecha\|hora\|contacto)` (§7.4.5). El resto, `nuevoId('ag_')` |
| `Nombre` | string | |
| `WhatsApp` | string | E.164 si se pudo normalizar, si no tal cual |
| `Email` | string minúsculas | |
| `Instagram` | string | |
| `Fecha call` | `YYYY-MM-DD` | día local de la llamada |
| `Hora` | `HH:MM` | hora local |
| `Estado` | uno de `ESTADOS` | `Pendiente · Confirmada · Re-agenda · Presentada · No-show · Cerrada · Cancelada · Descalificada` |
| `Closer` | string | nombre (`''` = sin closer) |
| `Setter` | string | |
| `Monto` | number \| `''` | cash de la venta nueva de esa llamada |
| `Programa` | string | |
| `Fecha cierre` | `YYYY-MM-DD` \| `''` | se completa al pasar a `Cerrada` |
| `Gatillo`, `Notas` | string | |
| `Capital` | `'<1K' \| '1-2K' \| '2-3K' \| '>3K' \| ''` | |
| `Origen` | string MAYÚSCULAS | `MASTERCLASS`, `WEBINAR`, `IG`, `WPP`, utm_source… |
| `Evento` | string | nombre del tipo de evento del calendario |
| `Timestamp` | ISO UTC con `T` y `Z` | cuándo se reservó (inicio.js lo convierte a la zona) |
| `CalendlyID` | string | id de la reserva en Calendly o iClosed (`''` en las manuales) |
| `Negocio`, `Facturacion`, `Objetivo`, `Traba`, `Urgencia`, `Decisor` | string | respuestas del form de agenda |
| `_fuente` | `'iclosed' \| 'calendly' \| 'manual' \| 'import'` | |
| `fuenteId` | string | `iclosed:<id>` / `calendly:<uuid del invitado>`; clave de upsert del sync |
| `eventoActualizado` | ISO | `updated_at` del evento de Calendly ya procesado (para saltearlo) |
| `eventoUri` | string | URI del evento de Calendly (agrupa a sus invitados para saltear el evento entero) |
| `utmAgenda` | `{utm_*}` | UTMs que trajo la reserva (si las trae) |
| `deFuente` | `{campo: valor}` | lo último que trajo la fuente en cada campo "solo si está vacío" de §7.5.4: un campo que alguien vació a mano no se vuelve a llenar con el mismo valor |
| `canceladaFuente` | boolean | si la fuente la traía cancelada en la última corrida: la cancelación se aplica una sola vez, en la transición (§7.5.4) |

Derivados en `GET /api/panel`: `_row`, `_id`, `_registro` (§7.4.2). Los internos (`fuenteId`, `eventoActualizado`,
`eventoUri`, `utmAgenda`, `deFuente`, `canceladaFuente`) **no** salen en la fila.

#### `crm` — CRM de ventas (ventas y cuotas en la misma colección)

Común: `{id: 'v_…'|'c_…', tipo: 'venta'|'cuota', mes: 'YYYY-MM', v: int ≥ 1, nombre, telefono, mail, instagram, fecha, closer, notas, situacion, de, historial: Hist[], creadoPor}`.

- Venta además: `presento` y `califica` (`'Sí'|'No'|''`), `dia1`, `seguimiento` (number), `fuente`, `setter`, `agenda` (id de fila del pipeline), `plan` (§7.6.4), `programa`, `total` (copiados del plan).
- Cuota además: `cuota` (etiqueta), `porCobrar`, `cobrado` (number), `venta` (id de la venta que la generó; **no** se usa `de` para esto).
- `de` = "copia de" el registro de otro mes (cuota traída o venta pasada al mes en curso).
- Ids: `nuevoId('v_'|'c_')`, salvo dos que son fijos para que una doble alta caiga en el mismo documento: la copia de
  otro mes, `idFijo(prefijo, 'copia', tipo, mes, de)`, y la cuota `i` de un cierre, `idFijo('c_', 'cierre', ventaId, i)`
  (`idFijo` = prefijo + 20 hex de `sha256` de las partes unidas con `|`; §7.6.2, §7.6.4).
- `Hist` = `{t: ISO, q: nombre de quien, c: string | {campo: [antes, después]}}`, máximo 100 por registro (se descartan las más viejas).

#### Otras internas

| Colección | id | Contenido |
|---|---|---|
| `crm-borrados` | `<id original>-<ms>` | `{original: doc, por, t}` (la copia que promete "Queda una copia guardada") |
| `integraciones` | `meta`, `calendly`, `iclosed`, `fathom`, `ia`, `ac` | §4.5 |
| `icp-ia` | `<webinarId>` o `todos` | `{estado: ''\|'working'\|'done'\|'error', pid, desde: ISO, error, resultado, corridas, nro, v}`: `corridas` = contador de cálculos lanzados (`incrementar`), `nro` = el de quien escribió el estado, `v` = versión de la escritura final (§7.9.2) |
| `cache` | `meta:<hash>` | `{exp: ms, valor}` (respuestas de Meta) |
| `limites` | `reg:<ip>:<YYYYMMDDHH>` · `acc:<ip>:<ventana15>` · `arranque:<ventana15>` · `alta:<webinarId>:<huella>` · `p2:<registroId>` | `{n}`: contadores atómicos (`incrementar`). Los dos primeros son los límites por IP; `arranque:` es el candado de `entrar` sobre la base vacía (§5.3); `alta:` (huella = 32 hex de sha256 del email o del WhatsApp, nunca en claro) y `p2:` son los candados de `/api/registro` (§7.12). Todos se limpian con `mhq_borrar_viejos` a las 48 h |
| `cola` | `<registroId>:<servicio>` | `{registro, servicio: 'ac'\|'meta'\|'metaCR', intentos, proximo: ms \| null, error}` (`proximo: null` = se dejó de reintentar; se limpian a los 7 días, §7.15) |

### 4.4 Colecciones genéricas (las que el frontend usa por `/api/db`)

| Colección | Documentos | Campos (los que escribe el frontend; el servidor agrega `creado` y `actualizado`) |
|---|---|---|
| `ag-evaluaciones` | id = `claveDe(agenda)` (lo manda el cliente) | `nombre, fecha, hora, closer, resultado, score, lead, interes, urgencia (0–10, paso 0,5), por, notas, link, estado:'evaluada'` |
| `ag-config` | `rubrica` | `{criterios: {score, lead, interes, urgencia}}` (textos) |
| `anun-config` | `atribucion` | `{tc: number > 0, origenes: string[]}` (se guardan por separado: **merge**) |
| `anun-plan` | generado `p…` | `{nombre, objetivo, estado: 'planificada'\|'revision'\|'activa'\|'pausada', presupuesto, metaId, metaNombre, inicio, fin, angulo, notas, orden}` (el drag manda solo `{id, orden, estado?}`: **merge**) |
| `anun-audiencias` | `lookalike` | `{ratio: 0.01\|0.03\|0.05, paises: string[≤5]}` |
| `utm-links` | generado | `{nombre, destino, source, medium, campaign, content, tipo: 'anuncio'\|'historia'\|'reel'\|'video'\|'mail'\|'link', pieza_url, pieza_titulo}` |
| `kpis-fijados` | id del KPI (`cap-reg`, …) | `{tab, etiqueta, orden: ms}` (compartido por el equipo) |
| `webinar-asistencia` | id del webinar | `{asistentes: int ≥ 0 \| null}` (`null` pisa) |
| `programas` | generado `pr…` | `{nombre (único por norm), precio: number ≥ 0, orden: int}` (los lee `/api/crm`) |

Cualquier otro nombre que cumpla `/^[a-z0-9][a-z0-9-]{0,40}$/` y no sea reservado se acepta con la regla por defecto
(lee y escribe `equipo` y `cliente`), para que una pantalla nueva no necesite backend.

### 4.5 Documento de integración (`integraciones/<cual>`)

| Campo | Tipo | Notas |
|---|---|---|
| `claveCifrada` | string | `cifrar(clave)` (§6.8). Nunca sale de las funciones. |
| `ultimos4` | string | para mostrar `…a1b2` |
| `estado` | `'ok' \| 'incompleta' \| 'error'` | resultado de la última prueba (`sin` no se guarda: es la ausencia del doc) |
| `error` | string | último error |
| `detalle` | string | texto para la tarjeta |
| `probado` | ISO | |
| meta: `cuenta` (`act_…`), `cuentaNombre`, `moneda`, `zonaCuenta`, `pixel`, `pixelNombre`, `testCode` | string | |
| calendly: `org` (URI de la organización), `usuario` | string | |
| fathom: `equipo` | string | |
| ac: `url`, `lista`, `listaNombre`, `tags: {"<etiqueta>": "<tagId>"}` | | |

Relaciones resumidas:

```
webinars.id ──< registros.w
registros (email | tel8) >──< agendas (Email | WhatsApp)     cruce calculado (§7.4.2), no hay FK
agendas.id ──< crm.agenda (ventas)
crm(venta).id ──< crm(cuota).venta          crm.de → crm.id (copia de otro mes)
personas(rol closer).nombre ≈ agendas.Closer ≈ crm.closer    por norm()
webinars.id ── ajustes/estado.webinarActivo
webinars.id ── webinar-asistencia.id · icp-ia.id
agendas.fuenteId ── ajustes/agendas-borradas (claves)     las borradas a mano que el sync no recrea
```

---

## 5. Sesión, códigos y roles

### 5.1 Códigos de acceso

- **Generación:** `XXXX-XXXX` con el alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `I`, `O`, `0`, `1`), `crypto.randomInt`. Cumple `[\w-]+` (lo exige `base.js:168`).
- **Normalización** (`normalizarCodigo`): `trim`, mayúsculas, sacar espacios; si quedan 8 caracteres `[A-Z0-9]` sin guion, insertar el guion después del 4.º. Resultado válido = `/^[A-Z0-9]{4}-[A-Z0-9]{4}$/` (para `CODIGO_INICIAL` se acepta además cualquier `/^[A-Z0-9-]{6,32}$/`). Inválido → no se busca.
- **Guardado:** solo `codigoHash = HMAC-SHA256(SESION_SECRETO, 'codigo:' + codigoNormalizado)` en hex. El texto plano se devuelve **una sola vez** (`persona` crear/codigo, `scripts/nuevo-acceso.mjs`).
- **Búsqueda:** `listar('personas', {donde: {codigoHash}})` y quedarse con la activa.
- **Límite de intentos:** cada código inválido suma 1 en `limites/acc:<ip>:<ventana de 15 min>`. Con `ACCESO_LIMITE` (10) o más, `entrar` responde `429 {error:'Demasiados intentos. Probá de nuevo en unos minutos.'}` **antes** de mirar el código. Un ingreso correcto no suma (así el `entrar` que hace mhq.js:463 después de regenerar el código propio nunca choca con el límite). Implementación: cada `entrar` suma 1 con `incrementar` **antes** de mirar nada (atómico: pedidos en paralelo no se saltean el límite) y un ingreso correcto lo resta. **Excepción con la IP ya cortada:** pasa quien ya tiene una sesión válida y pone **su propio** código (es el `entrar` de mhq.js:463 después de regenerarlo); cualquier otro recibe el 429.

### 5.2 Cookie de sesión

| Atributo | Valor |
|---|---|
| Nombre | `mhq_s` |
| Valor | `base64url(JSON {u: uid, v: sesionVer, e: expiraEpochSeg})` + `.` + `base64url(HMAC-SHA256(SESION_SECRETO, 'sesion:' + parte1))` |
| Duración | 30 días (`Max-Age=2592000`). `acceso yo` la renueva si le quedan menos de 7 días. |
| Flags | `HttpOnly; SameSite=Lax; Path=/` y `Secure` cuando el pedido es https: `new URL(req.url).protocol === 'https:'` o el primer valor de `x-forwarded-proto` es `https` (`esHttps`, §6.1). En `http://localhost` no va: si no, el navegador no la guarda |
| Borrado | `mhq_s=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax[; Secure]` |

Validación (`sesionDe(req)`): leer la cookie del header `cookie`; comparar la firma con `crypto.timingSafeEqual`;
`u` string, `v` entero y `e > ahora`; `obtener('personas', u)` existe, `activo !== false`, su `rol` es uno de `ROLES` y
`sesionVer === v` (`sesionVer` faltante = 0). Cualquier falla = sin sesión.
Se escribe con el header `Set-Cookie` de la `Response` (no con `context.cookies`, para que funcione igual en
`scripts/dev.mjs`).

Cerrar todas las sesiones de alguien = `sesionVer += 1` (lo hacen `persona {codigo}` y `persona {baja}`).

### 5.3 Arranque: el primer usuario

Si `entrar` recibe un código que no coincide con ninguna persona **y** la colección `personas` está vacía **y**
`normalizarCodigo(clave) === normalizarCodigo(CODIGO_INICIAL)` (comparación de tiempo constante sobre los HMAC),
se crea `{id: nuevoId('u_'), nombre: ADMIN_NOMBRE (trim, hasta 60) || 'Admin', rol: 'equipo', activo: true,
codigoHash: hash(CODIGO_INICIAL), sesionVer: 0, ultimoIngreso: null}` y se entra con esa persona. Desde ahí `CODIGO_INICIAL` es el código de ese admin hasta que lo regenere en Equipo.
Con personas ya creadas, `CODIGO_INICIAL` no tiene ningún efecto especial.

**De a uno (dos `entrar` a la vez sobre la base vacía crean una sola persona).** Leer `personas` y después escribir
no es atómico (dos pedidos a la vez verían la base vacía y crearían dos admin), así que el arranque va detrás de dos
candados que conviven:

1. `acceso.mjs` → `limites/arranque:<ventana de 15 min>` con `incrementar` (+1 al entrar, −1 al salir, en un
   `finally`): serializa dentro de la ventana; el que no lo consigue recibe el 401 de siempre.
2. `sesion.primerIngreso` → `ajustes/arranque = {dueno, desde}`: cubre el cambio de ventana. Se toma con
   `fusionarSi('ajustes', 'arranque', {dueno, desde}, {dueno: ['']})` (antes se asegura que el documento exista) y se
   suelta en un `finally`, salga bien o mal, con `fusionarSi(…, {dueno: '', desde: null}, {dueno: [el suyo]})`. Si
   soltarlo falla o la función murió con el candado tomado, vence a los **2 min**: pasado ese tiempo otro pedido lo
   saca, también atómico (solo si el `dueno` sigue siendo el que leyó). Con el candado tomado se vuelve a mirar si hay
   personas antes de crear; si ya hay, devuelve `null` (y `entrar`, 401).

No se usa un contador sin vencimiento para esto: si la función muere a mitad, quedaría trabado para siempre.

### 5.4 Matriz de roles (espejo del frontend, aplicada en el servidor)

Vistas por rol del frontend (`base.js:53-61`): `equipo` y `cliente` ven las 20; `closer` ve
`closers, central, analisis, pipeline, llamadas, precall, crm, webinar`.

`T` = los tres roles. `E/C` = `equipo` y `cliente`. Sin sesión siempre `401`; rol sin permiso siempre `403 {error}`.

| Endpoint · acción | Roles | Notas |
|---|---|---|
| `POST /api/acceso` entrar · salir | público | |
| `POST /api/acceso` yo | sesión (T) | sin sesión 401 |
| `/api/app` inicio · webinar · proyectar | T | el closer necesita `webinar` (textos de preguntas en Agendas) |
| `/api/app` guardarWebinar · activar · borrarWebinar · tarea · registros · integraciones · conectar · desconectar · probar · personas | E/C | |
| `/api/app` persona | E/C | `cliente` no crea `equipo` ni toca a un `equipo` (403); nadie se da de baja a sí mismo (400) |
| `GET /api/panel` | T | el closer ve todas las filas (§5.5) |
| `POST /api/panel {row, field, value}` | T | closer con restricciones (§5.5) |
| `POST /api/panel` add | T | |
| `POST /api/panel` adel · finanzasget · liqpago · comisiones | E/C | |
| `POST /api/panel` crmsync | T | |
| `/api/agendas-sync` GET · POST | T | la UI no esconde el botón a closers |
| `GET /api/crm` | T | closer: solo sus registros (§5.5) |
| `POST /api/crm` guardar · cierre | T | closer con restricciones (§5.5) |
| `POST /api/crm` borrar · metas | E/C | |
| `/api/db` GET `ag-evaluaciones`, `ag-config` | T | |
| `/api/db` todo lo demás | E/C | |
| `GET /api/meta-ads` (los 3 modos) | E/C | |
| `GET /api/icp` · `icp-generar-background` | E/C | |
| `GET /api/tablero` | E/C | |
| `GET /.netlify/functions/salud` | E/C | el closer recibe 403 y la tarjeta no se muestra |
| `/api/publico` · `/api/registro` | público | sin cookie, con límites (§7.11-12) |

### 5.5 Alcance del rol `closer`

- **Pipeline:** lee todas las filas (las métricas de closers, el leaderboard y "sin closer" las necesitan). Edita
  solo filas cuyo `Closer` (con `norm`) es el suyo o está vacío; los campos permitidos son `Estado`, `Monto`,
  `Gatillo`, `Notas`, `Programa` y `Closer`, y `Closer` solo puede quedar en su propio nombre o en `''`.
  Fuera de eso: `403 {error:'Esa agenda es de otro closer'}` / `403 {error:'Ese campo no lo podés cambiar'}`.
- **CRM:** `GET` devuelve solo los registros con `norm(closer) === norm(yo.closer)` (el leaderboard sí es de todo
  el equipo). `guardar`/`cierre`: el `closer` se fuerza a `yo.closer`; solo registros propios (si no,
  `403 {error:'Ese registro es de otro closer'}`) y con `mes ∈ [mesSig(hoy,-1), mesSig(hoy,1)]` → si no,
  `403 {error:'Ese mes ya está liquidado'}`. Lo que engancha (la `agenda`, el registro del que es copia) también tiene
  que ser suyo (§7.6.2).
- `yo.closer` = `persona.nombre` si el rol es `closer`, si no `''`.

---

## 6. Librería compartida (paquete 0): firmas exactas

Todos los módulos son ESM (`.mjs`), sin dependencias salvo las de D17. Los paquetes 1-8 programan contra estas
firmas en paralelo.

### 6.1 `netlify/lib/http.mjs`

```js
export class HttpError extends Error {
  constructor(status, mensaje, extra = {})   // extra se agrega al cuerpo: p. ej. {registro} en el 409 del CRM
  status; extra;
}
// 200 por defecto. Agrega content-type JSON y cache-control (por defecto 'no-store'; cache: null = sin header).
// headers: objeto (un valor array = varias líneas, p. ej. dos Set-Cookie), array de pares o Headers.
// NO agrega ok:true solo: lo pone quien llama cuando corresponde.
export function json(datos, { status = 200, headers = {}, cache = 'no-store' } = {}) → Response
// Cuerpo {...extra, ok:false, error: mensaje} (extra no puede pisar ok ni error)
export function error(status, mensaje, extra = {}) → Response
// Lee el cuerpo como JSON. Vacío → {}. No es JSON, no es un objeto (un array tampoco) o pasa de max bytes (por
// content-length o por lo leído) → HttpError(400, 'Pedido inválido'). Se puede llamar más de una vez con el mismo req.
export async function leerJSON(req, { max = 256 * 1024 } = {}) → object
// 405 {error:'Método no permitido'} con cache-control no-store si req.method no está.
export function metodo(req, permitidos /* ['GET','POST'] */) → void
export function query(req) → URLSearchParams
export function ipDe(req, context) → string        // context?.ip || x-nf-client-connection-ip || x-forwarded-for[0] || '0.0.0.0'
export function esHttps(req) → boolean             // protocolo https o x-forwarded-proto: https
// Envuelve un handler: HttpError (o un error con name 'HttpError' y status entero) → error(status, mensaje, extra);
// cualquier otro → console.error + 500 'Algo falló: probá de nuevo'.
export function manejar(fn /* (req, context) => Promise<Response> */) → (req, context) => Promise<Response>
```

Regla de oro (base.js:29): **una respuesta exitosa nunca lleva la clave `error` ni `ok:false`**; los errores siempre
con status no 2xx y `error` string legible.

### 6.2 `netlify/lib/almacen.mjs` (fachada) y drivers

```js
// doc = {...data, id, creado, actualizado}
export async function obtener(col, id) → doc | null
// donde: igualdad sobre claves de primer nivel de data, valores string (se comparan como texto).
// Devuelve TODOS (pagina por dentro de a 1000), ordenados por creado ascendente.
export async function listar(col, { donde = {} } = {}) → doc[]
// Reemplaza data entera (crea si no existe). Si doc.id falta, genera uno con nuevoId(prefijo).
export async function guardar(col, doc, { prefijo = '' } = {}) → doc
// Merge superficial (claves nuevas pisan, null pisa, lo que no viene se conserva). Crea si no existe.
export async function fusionar(col, id, parcial) → doc
// Varios a la vez; cada uno con id (si falta, se genera). Ids repetidos en la lista se combinan antes.
// Crea los que no existen: para actualizar filas que ya estaban, fusionarVariosSiExisten.
export async function fusionarVarios(col, docs, { prefijo = '' } = {}) → doc[]
// Como fusionar, pero nunca crea y, si viene `si`, solo escribe si se cumple la condición. Atómico (compare-and-set).
export async function fusionarSi(col, id, parcial, si = null) → doc | null
// Como fusionarVarios, pero solo actualiza los que ya existen; los que no, se saltean.
export async function fusionarVariosSiExisten(col, docs) → doc[]
export async function borrar(col, id) → boolean
// Reemplaza solo si data.v === vEsperada (0 si no tiene v). Devuelve null si no coincidió o no existe.
export async function reemplazarSiVersion(col, id, data, vEsperada) → doc | null
export async function incrementar(col, id, campo = 'n', n = 1) → number
export async function borrarViejos(col, antesISO) → number
// Para salud: dice el driver elegido aunque en Netlify 'archivo' no se pueda usar (ver abajo)
export function driver() → 'supabase' | 'archivo'
```

Lo que la fachada controla antes de llamar al driver (un error de estos es de programación: `Error` común, un 500):
`col` tiene que cumplir `/^[a-z0-9][a-z0-9-]{0,63}$/` e `id` tener de 1 a 200 caracteres (`obtener` y `fusionarSi` con
`id` `null` o `''` devuelven `null` sin preguntar); el documento tiene que ser un objeto y pasa por
`JSON.parse(JSON.stringify(…))` (los `undefined` se van, un `Date` queda ISO) y se le sacan `id`, `creado` y
`actualizado`. `fusionarVarios` genera los ids que faltan con el prefijo y combina los repetidos (el último pisa).
`borrarViejos` con una fecha que no se entiende tira `Error`.

**`fusionarSi(col, id, parcial, si = null) → doc | null`**

- Fusiona igual que `fusionar` (merge superficial: lo nuevo pisa, `null` también, lo que no viene se conserva; `id`,
  `creado` y `actualizado` del parcial se ignoran), **solo si `(col, id)` ya existe**: nunca crea. Con `id` `null` o
  `''` devuelve `null`.
- Si viene `si = {clave: lista}`, para cada clave el valor actual `data[clave]` tiene que estar en `si[clave]`. Se
  compara **como texto exacto** (sin `norm` ni `trim`): números y booleanos con `String`; los valores de la lista
  también pasan por `String` (`null`/`undefined` → `''`; un objeto, por `JSON.stringify`). `si` tiene que ser un
  objeto (un array o un valor suelto tira `Error`); `null` o `{}` = sin condición.
- `''` en la lista = vacío o ausente (`null`, `undefined` o `''`). Ejemplo: `{Closer: ['', 'Laura Gómez']}` = «Closer
  vacío o igual a Laura Gómez». Un valor suelto vale como lista de uno; una lista vacía no se cumple nunca; todas las
  claves tienen que cumplir.
- Si no se cumple (o no existe): devuelve `null`, no escribe y no toca `actualizado`.
- Atómico: entre mirar la condición y escribir no se mete nadie. En `archivo`, dentro de la fila de escrituras de la
  colección; en Supabase, con la RPC `mhq_fusionar_si` (`SELECT … FOR UPDATE` + `UPDATE`, sin insert).
- **Solo para valores simples** (string, number, boolean): con objetos o arrays, el texto que compara Postgres
  (`data->>k`) no coincide con `JSON.stringify`.
- Uso típico: la regla de negocio compara con `norm` (§5.5), así que primero se lee la fila y se decide con `norm`, y
  después se hace el compare-and-set con el **valor exacto leído**:
  `fusionarSi('agendas', id, {Closer: yo.closer}, {Closer: ['', fila.Closer || '']})`. Si da `null`, otro la cambió o
  la borró: se vuelve a leer y se responde 404/409 o se reintenta. Sin `si`, sirve para "escribir solo si todavía
  existe" (una edición sobre una fila borrada no la recrea).

**`fusionarVariosSiExisten(col, docs) → doc[]`**

- `docs = [{id, ...campos}]`. Los ids repetidos se combinan antes (el último pisa) y los docs sin `id` se saltean.
- Actualiza solo los que existen, con el mismo merge que `fusionar`; los que no existen no se crean. Devuelve los
  actualizados, en el orden en que aparecen por primera vez. No es condicional por campos.
- Es la que usan el sync de calendarios y `crmsync` para las agendas que ya estaban; `fusionarVarios` y `guardar`
  quedan para crear las nuevas. Así una agenda borrada entre la lectura y la escritura no vuelve como fila fantasma.

**Sin Supabase en Netlify.** La fachada elige el driver en cada operación: si el driver es `archivo` y `enNetlify()`
(§6.4) es `true`, **toda** operación tira `HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL y
SUPABASE_SERVICE_ROLE_KEY en Netlify y no uses ALMACEN=archivo')` (D14). `driver()` sigue devolviendo `'archivo'`
(lo usa salud). Con `NETLIFY_DEV` o `NETLIFY_LOCAL` (`netlify dev`) el driver archivo anda.

**Driver Supabase** (`almacen-supabase.mjs`): base `${SUPABASE_URL}/rest/v1`. Headers en todo pedido:
`apikey: <clave>`, `Content-Type: application/json`, `Prefer: return=representation`, y además
`Authorization: Bearer <clave>` **solo si la clave no empieza con `sb_`** (la `service_role` JWT vieja; ver 1.2).
Cada pedido espera hasta 15 s (`AbortSignal.timeout(15000)`). Las RPC de varios devuelven los documentos en el orden de
la lista que se mandó (sin los que no se escribieron).

| Operación | HTTP |
|---|---|
| obtener | `GET /mhq_docs?col=eq.<col>&id=eq.<id>&select=id,data,creado,actualizado` |
| listar | `GET /mhq_docs?col=eq.<col>[&data->>campo=eq.<valor>]&select=id,data,creado,actualizado&order=creado.asc,id.asc&limit=1000&offset=<n>` en bucle hasta recibir < 1000 (los valores van con `encodeURIComponent`; `null` → `data->>campo=is.null`; una clave con espacios o acentos, como `Fecha call`, no va en la URL: se filtra en memoria con la misma regla) |
| guardar | `POST /mhq_docs?on_conflict=col,id` con `Prefer: resolution=merge-duplicates,return=representation`, cuerpo `{col, id, data, actualizado: <ahora ISO>}` (sin `creado`: se conserva) |
| fusionar | `POST /rpc/mhq_fusionar` `{p_col, p_id, p_data}` |
| fusionarVarios | `POST /rpc/mhq_fusionar_varios` `{p_col, p_docs: [{id, ...data}]}` (de a 500) |
| fusionarSi | `POST /rpc/mhq_fusionar_si` `{p_col, p_id, p_data, p_si: {clave: ['texto', …]}}` → `[]` = no existe o no cumplió (`p_si` vacío `{}` = sin condición) |
| fusionarVariosSiExisten | `POST /rpc/mhq_fusionar_varios_si_existen` `{p_col, p_docs: [{id, ...data}]}` (de a 500, con el mismo loteo que `fusionarVarios`) → solo las filas actualizadas |
| borrar | `DELETE /mhq_docs?col=eq.<col>&id=eq.<id>` → `true` si borró una fila |
| reemplazarSiVersion | `POST /rpc/mhq_reemplazar_si` `{p_col, p_id, p_data, p_v}` → `[]` = no coincidió |
| incrementar | `POST /rpc/mhq_incrementar` `{p_col, p_id, p_campo, p_n}` → número |
| borrarViejos | `POST /rpc/mhq_borrar_viejos` `{p_col, p_antes}` |

Un status ≥ 400 de PostgREST → `throw new Error('Base: ' + status + ' ' + mensaje)` (lo atrapa `manejar` → 500).
Sin `SUPABASE_URL` o sin la clave, cada operación tira `HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL
y SUPABASE_SERVICE_ROLE_KEY')` (la persona ve qué falta, no un 500 genérico).

**Driver archivo** (`almacen-archivo.mjs`): un archivo por colección `<DATOS_DIR>/<col>.json` =
`{"<id>": {"data": {...}, "creado": "...", "actualizado": "..."}}`. Caché en memoria por colección (se recarga si
otro proceso tocó el archivo, p. ej. la semilla con el servidor corriendo), escrituras serializadas por colección
(cadena de promesas) y atómicas (`<col>.json.tmp` + `rename`). `listar` filtra en memoria. Mismas semánticas que el
driver Supabase (incluidos merge, nulls, versión y la condición de `fusionarSi`). `fusionarSi` y
`fusionarVariosSiExisten` miran y escriben dentro de la misma vuelta de la fila: son atómicas en un mismo proceso.
Crea la carpeta si falta.

### 6.3 `netlify/lib/sesion.mjs`

```js
export const ROLES = ['equipo', 'cliente', 'closer'];
export const PERFILVIEWS = { equipo: [/* las 20 de base.js:53 */], cliente: [/* las 20 */],
  closer: ['closers','central','analisis','pipeline','llamadas','precall','crm','webinar'] };
export const MENSAJE_401 = 'Tu sesión se cerró: entrá de nuevo con tu link.';
// Yo = {uid, nombre, rol, closer}   (closer = nombre si rol es 'closer', si no ''). Lleva además sesionVer como
// propiedad no enumerable: no sale en las respuestas, pero alcanza para renovar la cookie con cookieSesion(yo, req).
export async function sesionDe(req) → Yo | null
// 401 HttpError(MENSAJE_401) sin sesión; 403 HttpError('No tenés acceso a esto') si el rol no está.
export async function requerir(req, roles = ROLES) → Yo
export function cookieSesion(persona, req) → string          // valor del header Set-Cookie; acepta la persona o un Yo
export function cookieBorrar(req) → string
export function quedaPoco(req) → boolean                     // la cookie vence en < 7 días
export function normalizarCodigo(s) → string | null
export function generarCodigo() → string                     // 'XXXX-XXXX'
export function hashCodigo(codigoNormalizado) → string
// Firmas cortas para otros usos (p. ej. la firma del registro): los primeros 22 caracteres base64url (128 bits) del
// HMAC(SESION_SECRETO, dominio + ':' + texto). verificarFirma: firma string y comparación de tiempo constante.
export function firmar(dominio, texto) → string
export function verificarFirma(dominio, texto, firma) → boolean
export function yoPublico(yo) → {uid, nombre, rol, pantallas: PERFILVIEWS[rol]}
// Extras que usa acceso.mjs:
export async function personaPorCodigo(codigoNormalizado) → persona activa | null
// §5.3: sin personas y con el código igual a CODIGO_INICIAL crea el primer admin y lo devuelve; si no, null.
// Toma el candado ajustes/arranque (fusionarSi) y lo suelta en un finally; vence solo a los 2 min.
export async function primerIngreso(codigoNormalizado) → persona | null
```

Si `SESION_SECRETO` falta o tiene menos de 32 caracteres, `sesionDe` y `requerir` tiran `HttpError(500, 'Falta configurar SESION_SECRETO')`.

### 6.4 `netlify/lib/config.mjs`

```js
export const ESTADOS = ['Pendiente','Confirmada','Re-agenda','Presentada','No-show','Cerrada','Cancelada','Descalificada'];
export const INTEGRACIONES = ['meta','calendly','iclosed','fathom','ia','ac'];
// Negocio = {nombre, color, moneda, zona, pais, locale, prefijoTel, duracionMin, horaPorDefecto}
// = defaults ← env (§3.2) ← ajustes/negocio, campo por campo (un valor de ajustes/negocio que no es null ni '' gana
// aunque no valide). Valida y, si falla, va el default (no la variable): nombre trim hasta 80; color
// /^#[0-9a-f]{6}$/i (sale en minúsculas); moneda ISO de Intl (en mayúsculas); zona IANA con Intl; pais uno de los 20;
// locale con Intl.getCanonicalLocales; prefijoTel 1 a 4 dígitos; duracionMin entero 30–600; horaPorDefecto esHora.
// ajustes/negocio se guarda en memoria 30 s (lo comparten negocio() y opciones()).
export async function negocio() → Negocio
// Opciones = {formatos, cierres, roles, vara, listas, medios, capitalTramos, camposAgenda, mapeoForm, origenesPauta}
// Desde ajustes/negocio: los arrays se reemplazan si vienen con algo; roles y listas se fusionan clave por clave; vara,
// abajo. Cada llamada devuelve una copia (se puede tocar sin cambiar la de otro pedido).
export async function opciones() → Opciones
export async function webinarActivoId() → string | null          // ajustes/estado.webinarActivo
export async function fijarWebinarActivo(id /* string|null */) → void   // fusionar ajustes/estado
export function env(nombre, porDefecto = '') → string            // con trim; vacía = porDefecto
// Desplegado en Netlify: NETLIFY, SITE_ID o AWS_LAMBDA_FUNCTION_NAME; false con NETLIFY_DEV o NETLIFY_LOCAL (netlify dev)
export function enNetlify() → boolean
```

`vara` desde `ajustes/negocio`: cada valor pasa por `monto()` (§6.6), así `'20,5'` da `20.5`, `'1.500'` da `1500` y
`'US$ 2.300,50'` da `2300.5`; lo que no se entiende deja el valor por defecto, y `''` o `null` dan `null`. Las claves
que no son de las 11 se ignoran.

Valores por defecto de `opciones()` (todo pisable desde `ajustes/negocio`):

```js
formatos: ['Masterclass en vivo', 'Webinar con Q&A', 'Taller práctico', 'Clase grabada'],
cierres:  ['Llamada', 'Checkout', 'Checkout + llamada'],
roles:    { equipo: 'Equipo', cliente: 'Cliente', closer: 'Closer' },
vara: {   // referencias genéricas editables; las 11 claves siempre presentes (number | null)
  presupuesto: null, registros: null, pctCalificados: 30, pctAsistencia: 25, pctAgenda: 3,
  pctShow: 65, pctCierre: 20, ticket: null, roasObjetivo: 3, llamadasPorCloser: 7, diasLlamadas: 4 },
listas: {
  siNo: ['Sí', 'No'],
  situacionVenta: ['Adentro en Llamada', 'Adentro en Seguimiento', 'Cerrado en 2 llamadas', 'Fee',
                   'Seguimiento', 'Reagendó', 'Lo va a pensar', 'No cerró', 'No se presentó'],
  situacionCuota: ['Por Cobrar', 'Cobrado', 'Pago Dividido', 'Paga tarde', 'Completó PIF', 'No Paga'],
  cuota: ['Cuota 1', 'Cuota 2', 'Cuota 3', 'Cuota 4', 'Completó PIF', 'Adentro en Seguimiento', 'Fee'],
  conceptoEntrada: ['Adentro en Llamada', 'Adentro en Seguimiento', 'Fee'],
  conceptoDespues: ['Cuota 2', 'Cuota 3', 'Cuota 4', 'Completó PIF', 'Adentro en Seguimiento'] },
medios: ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'USDT', 'Efectivo'],
capitalTramos: [{k:'>3K', desde:3001}, {k:'2-3K', desde:2000}, {k:'1-2K', desde:1000}, {k:'<1K', desde:0}],
camposAgenda: ['Capital', 'Negocio', 'Urgencia', 'Decisor', 'Facturacion'],
origenesPauta: ['MASTERCLASS', 'WEBINAR'],
mapeoForm: [   // pregunta del form de agenda (minúsculas, sin tildes) contiene → campo de la fila
  { contiene: ['capital', 'invertir', 'inversion', 'presupuesto'], campo: 'Capital' },
  // Facturacion antes que Negocio: «¿Cuánto factura tu negocio?» es Facturacion
  { contiene: ['factur', 'ingres', 'ganas'], campo: 'Facturacion' },
  { contiene: ['negocio', 'dedicas', 'trabajas', 'ocupacion'], campo: 'Negocio' },
  { contiene: ['objetivo', 'lograr', 'meta'], campo: 'Objetivo' },
  { contiene: ['frena', 'traba', 'impide', 'problema'], campo: 'Traba' },
  { contiene: ['urgen', 'cuando', 'empezar'], campo: 'Urgencia' },
  { contiene: ['decid', 'socio', 'pareja'], campo: 'Decisor' },
  { contiene: ['instagram'], campo: 'Instagram' },
  { contiene: ['whatsapp', 'telefono', 'celular'], campo: 'WhatsApp' } ]
```

El sync no toma la primera regla que coincide: elige la entrada cuya palabra aparece **primero** en la pregunta
(empate: el orden de la lista; §7.5.4). Con eso «¿Cuánto factura tu negocio?» ya caía en `Facturacion`; el orden de
arriba es para quien elija por la primera regla que coincide.

### 6.5 `netlify/lib/fechas.mjs`

Con datos que no entienden (no string, fecha rota, `null`), las funciones devuelven `false` o `null`, **nunca tiran**:
la única que tira a propósito es `aUTC` (sus llamadores validan antes o la envuelven). Dos bordes: `sumarDias` y
`mesSig` hacen la cuenta con `Date.UTC`, así que una fecha con forma pero imposible se corre en vez de dar `null`
(`sumarDias('2026-02-30', 1)` = `'2026-03-03'`, `mesSig('2026-13', 1)` = `'2027-02'`: quien llama valida con `esFecha`
antes); y un `n` que saca el resultado del rango de `Date` (unos 10⁸ días) da `null` en `sumarDias` y `mesSig`. La
zona la tienen que traer válida (la de `negocio()`): con una zona que no existe, `Intl` tira.

```js
export function hoyLocal(zona) → 'YYYY-MM-DD'                 // Intl en-CA con timeZone
export function mesLocal(zona) → 'YYYY-MM'
// iso = Date, string ISO o ms. Cualquier otra cosa o un instante inválido → null (diaLocal(null) ya no da 1970-01-01)
export function diaLocal(iso, zona) → 'YYYY-MM-DD' | null
export function horaLocal(iso, zona) → 'HH:MM' | null
// fecha+hora de pared en `zona` → instante UTC. Respeta horario de verano: calcula el offset de esa zona en ese
// instante con Intl (dos pasadas) y devuelve Date.toISOString() (siempre termina en 'Z').
// Tira Error si fecha u hora no son válidas (el mensaje no hace String() de lo que llegó).
export function aUTC(fecha, hora, zona) → string
export function sumarDias(fecha, n) → 'YYYY-MM-DD' | null      // aritmética de calendario (UTC puro); null si fecha no es un string de números con guiones o n no es número
export function difDias(a, b) → int | null                     // b - a en días (redondeado); null (no NaN) si no se entiende
export function mesSig(mes, n) → 'YYYY-MM' | null              // null si mes no es un string 'AAAA-MM' de números o n no es número
export function esFecha(s) → boolean                           // /^\d{4}-\d{2}-\d{2}$/ y válida
export function esHora(s) → boolean                            // /^([01]\d|2[0-3]):[0-5]\d$/
```

### 6.6 `netlify/lib/normalizar.mjs`

```js
// Idéntica a crm.js:24 / finanzas.js:36 (los rangos ̀-ͯ son los combinantes U+0300–U+036F).
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Idéntica a utms.js:20: trim; si es una macro {{x.y}} queda igual; si no, minúsculas y espacios → '-'.
export function normUtm(v) → string
export function slug(s) → string                 // norm(s) con espacios → '-', máx. 60, sin '-' al final
// Misma lógica que num() de ads.js:97-107 ('1.500' = 1500, '1,5' = 1.5, 'US$ 2.300,50' = 2300.5); '' / null / sin
// dígitos → null. Solo string o number (finito): lo demás, Infinity y NaN incluidos, → null.
export function monto(v) → number | null
export function email(s) → string                // trim + minúsculas
export function digitos(s) → string
export function tel8(s) → string                 // últimos 8 dígitos ('' si hay menos de 8)
export function idSeguro(s) → boolean            // string y /^[A-Za-z0-9_-]{1,64}$/ (un número da false)
export function nuevoId(prefijo = '') → string   // prefijo + Date.now().toString(36) + 6 [a-z0-9]
export function azar(n, alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789') → string   // n caracteres al azar (crypto.randomInt)
export function texto(s, max = 2000) → string    // String, trim, corta en max
export function httpsUrl(s) → string | null      // '' → ''; https://… válida → la URL; otra cosa → null
```

**Valores que no son simples.** Lo que llega de un pedido puede ser cualquier cosa: `texto`, `norm`, `email`,
`digitos`, `tel8`, `normUtm`, `slug` y `httpsUrl` solo pasan a texto un string, number o boolean; con cualquier otro
valor (objeto, array, símbolo, función, `Date`, bigint) dan `''` (así `texto({})`, `norm([1])` y `httpsUrl({})` dan
`''`), y `monto` da `null`. Antes hacían `String(v)`: un objeto daba `'[object Object]'` y un array muy anidado tiraba
`RangeError` (un 500). Para los valores simples el resultado no cambió (`texto(0)` = `'0'`; `norm(0)` = `''`, como
el `String(s || '')` del frontend).

### 6.7 `netlify/lib/telefono.mjs`

```js
// [iso, nombre, prefijo, largoMin, largoMax] — largo nacional después de sacar el 0 inicial
export const PAISES = [
  ['AR','Argentina','54',10,11], ['BO','Bolivia','591',8,8], ['CL','Chile','56',9,9], ['CO','Colombia','57',10,10],
  ['CR','Costa Rica','506',8,8], ['DO','Rep. Dominicana','1',10,10], ['EC','Ecuador','593',9,9], ['ES','España','34',9,9],
  ['GT','Guatemala','502',8,8], ['HN','Honduras','504',8,8], ['MX','México','52',10,10], ['NI','Nicaragua','505',8,8],
  ['PA','Panamá','507',8,8], ['PE','Perú','51',9,9], ['PR','Puerto Rico','1',10,10], ['PY','Paraguay','595',9,9],
  ['SV','El Salvador','503',8,8], ['US','Estados Unidos','1',10,10], ['UY','Uruguay','598',8,8], ['VE','Venezuela','58',10,10] ];
export function esPais(iso) → boolean
// Número nacional (como lo tipea la persona en la landing) → E.164. null si no valida (o si el país no es de los 20).
//  1) d = dígitos; un '00' inicial (salida internacional) se saca; si empieza con el prefijo del país, lo que queda
//     llega al largo mínimo y d pasa el largo máximo, se saca el prefijo; se saca un 0 inicial.
//  2) AR: si quedan 12 y en las posiciones 2-4 aparece '15' después del código de área, se saca ese '15';
//     10 dígitos → '+549' + d; 11 que empiezan con 9 → '+54' + d; otro largo → null. (wa.me necesita el 9 de móvil.)
//  3) MX: 11 que empiezan con 1 (el 1 de móvil del formato viejo) → se saca el 1; 10 → '+52' + d.
//     Resto: largoMin ≤ largo ≤ largoMax → '+' + prefijo + d.
export function normalizar(pais, numero) → { e164: string, digitos: string } | null   // digitos = e164 sin '+'
// Para teléfonos que llegan de calendarios u otras fuentes: si empieza con '+' o '00' se toman los dígitos tal cual
// (de 8 a 15; si no, ''); si no, normalizar(paisPorDefecto, s); si no, se prueba con cada país cuyo prefijo aparece
// adelante y sobra largo; si nada sirve, '' (quien llama guarda el original en la fila).
export function normalizarLibre(s, paisPorDefecto) → string   // E.164 o ''
```

### 6.8 `netlify/lib/cifrado.mjs`

```js
// AES-256-GCM, clave = sha256(CIFRADO_SECRETO || SESION_SECRETO + ':cifrado') (con trim), iv de 12 bytes al azar.
// Sin ninguna de las dos variables, cifrar y descifrar tiran Error('Falta configurar SESION_SECRETO').
export function cifrar(texto) → string     // 'v1:' + b64(iv) + ':' + b64(tag) + ':' + b64(cifrado)
export function descifrar(s) → string      // tira Error si no se puede (formato raro o clave cambiada): se trata como "sin clave"
export function enmascarar(s) → string     // '…' + últimos 4 ('' si no hay nada)
```

### 6.9 `netlify/lib/integraciones/estado.mjs`

```js
// Integracion = { cual, conectada: boolean, clave: string|null, origen: 'guardada'|'env'|'demo'|null,
//   doc: <doc guardado sin claveCifrada> | null, ...campos resueltos (string) }
// Campos resueltos por servicio (entre paréntesis, la variable de §3.3 que los completa):
//   meta: cuenta (META_CUENTA), pixel (META_PIXEL), testCode, capiToken (META_CAPI_TOKEN), version (META_API_VERSION,
//         'v26.0'), cuentaNombre, moneda, zonaCuenta, pixelNombre · calendly: org, usuario · fathom: equipo
//         (FATHOM_EQUIPO) · ia: modelo (ICP_MODELO, 'claude-opus-5-5') · ac: url (AC_URL), lista (AC_LISTA),
//         listaNombre y tags (objeto, solo lo guardado)
// Resolución campo por campo: lo guardado (ni null ni '') pisa a la variable de entorno; la clave guardada pisa a
// la de la variable. Una clave guardada que no se puede descifrar (cambió el secreto) cuenta como que no hay.
// conectada = hay clave y están los REQUISITOS (un estado 'error' guardado no la desconecta).
// DEMO_META=1 → meta conectada, origen 'demo', clave 'demo', cuenta 'act_demo', pixel '' (nunca se carga el píxel en
// la landing en demo). Un cual que no es de INTEGRACIONES → HttpError(400, 'Integración desconocida').
export async function leerIntegracion(cual) → Integracion
export async function guardarIntegracion(cual, parcial /* {clave?, ...campos, estado, error, detalle} */) → void
//   fusionar sobre integraciones/<cual>. Si parcial.clave viene (con trim): claveCifrada = cifrar(clave), ultimos4;
//   parcial.clave, claveCifrada y ultimos4 que vengan en el parcial nunca se guardan tal cual
export async function borrarIntegracion(cual) → void
// Las etiquetas de lo que falta según REQUISITOS (vacío = completo)
export function faltan(cual, campos) → string[]
// Lo que devuelve /api/app integraciones para un servicio (forma exacta en §7.3.9). Sin llamadas externas.
export async function estadoPublico(cual) → IntegracionEstado
// Requisitos por servicio: qué campos hacen falta además de la clave y su etiqueta para `falta`.
export const REQUISITOS = {
  meta: [['cuenta', 'la cuenta publicitaria'], ['pixel', 'el píxel']],
  calendly: [], iclosed: [], ia: [],
  fathom: [['equipo', 'el equipo de los closers']],
  ac: [['url', 'la URL de la API'], ['lista', 'la lista']] };
```

### 6.10 Despachadores `app.mjs` y `panel.mjs` (P0) y contrato de los módulos de acciones

```js
// netlify/lib/app/<modulo>.mjs  y  netlify/lib/panel/<modulo>.mjs
export const acciones = {
  // nombre: { roles: ['equipo','cliente','closer'], fn: async ({ cuerpo, yo, req, context }) => objeto }
};
```

`netlify/functions/app.mjs`: `config = { path: '/api/app', method: ['POST'] }`. Lee el cuerpo, busca
`cuerpo.accion` en la unión de `webinars.mjs`, `personas.mjs`, `registros.mjs` e `integraciones.mjs` (con
`Object.hasOwn`; un nombre que empieza con `__` no se acepta), y si no está → `400 {error:'Acción desconocida'}`;
después `requerir(req, roles)`, ejecuta y responde `json({ ...resultado, ok: true })` (el `ok` va al final: el
resultado no lo puede pisar). Si `fn` devuelve una `Response`, se devuelve tal cual (para Set-Cookie).

`netlify/functions/panel.mjs`: `config = { path: '/api/panel', method: ['GET','POST'] }`.
`GET` → `agendas.acciones.__listar`. `POST` con `cuerpo.action` string no vacío → la acción con ese nombre de
`agendas.mjs` o `finanzas.mjs` (las que empiezan con `__` no se piden por nombre; desconocida →
`400 {error:'Acción desconocida'}`); `POST` con `row` y `field` → `agendas.acciones.__editar`; otro →
`400 {error:'Pedido inválido'}`. Mismo envoltorio `{...resultado, ok:true}`.

P0 deja los cuatro módulos de `lib/app/` y los dos de `lib/panel/` como **stubs** (`export const acciones = {}`)
para poder probar el despacho; cada paquete reemplaza el suyo.

### 6.11 Firmas entre paquetes (para programar en paralelo)

| Módulo (dueño) | Exporta |
|---|---|
| `webinars.mjs` (P1) | `obtenerWebinar(id) → doc\|null` (`null` sin consultar si el id no pasa `idSeguro`) · `listarWebinars() → doc[]` (por `fecha` y `hora` asc) · `inicioISO(w, zona) → string` (con una `hora` inválida usa `'00:00'`; tira si la fecha está rota) · `popupISO(w, zona) → string\|null` (`null` sin pop-up o con su fecha inválida; sin hora propia, la del vivo) · `duracionDe(w, neg?) → number` (`Number(w.duracionMin)` si es finito y > 0, también `'90'` guardado como texto; si no, `neg.duracionMin` con la misma regla; si no, 180) · `terminado(w, zonaONeg, ahoraMs = Date.now()) → boolean` (ahora > inicio + `duracionDe`; el segundo argumento es la zona, string, o el negocio entero `{zona, duracionMin}`: con solo la zona, un webinar sin duración propia toma 180; con la fecha rota o un inicio que no se puede leer, `true`) · `vistaPublica(w, neg) → {id, formato, zona, inicio, popup, duracionMin, pais, landing}` (con `duracionDe(w, neg)` y `landingPublica`). La ficha (§7.3.2), `/api/publico` y `/api/registro` dan la misma duración |
| `proyeccion.mjs` (P1) | `CLAVES_PROY` (las 11) · `parsearEntrada(obj) → {clave:number}` (solo las cargadas y ≥ 0: `presupuesto`, `registros` y `ticket` con `monto()`, así `'1.500'` = 1500; las tasas toman el último `,` o `.` como decimal, así `'1,125'` = 1.125 y `'22,5'` = 22.5; `''`, negativo, no numérico o un valor que no es string ni number → se omite) · `calcular(guardada, vara) → Proyeccion` (§7.3.3) |
| `checklist.mjs` (P1) | `PLANTILLA` (los 8 bloques de §7.3.7) · `armarTareas(fecha, ventana = 10) → Tarea[]` (ventana que no es entero > 0 → 10) · `nuevaTarea({bloque, texto, vence, offset = null}) → Tarea` (id `nuevoId('t')`, `hecha: false`) · `progreso(tareas, hoy) → {hechas,total,vencidas,pct}` · `correrFechas(tareas, dias) → Tarea[]` (copia; con `dias` 0 o una `vence` inválida, esa tarea queda igual) · `ordenar(tareas) → Tarea[]` (§7.3.7) |
| `landing.mjs` (P1) | `LANDING_DEFECTO` · `parsearLanding(form, guardada) → Landing` (tira `HttpError(400)` en URLs no https; §7.3.4) · `landingPublica(landing) → Landing sin calificadas` (los links inválidos quedan `''`) · `completarLanding(landing) → Landing` (la guardada con todas sus claves y tipos, sin tirar por links viejos: la que ve el editor en la ficha) |
| `registros.mjs` (P2) | `UTM_CLAVES` (las 5) · `SIN_UTM` (`'(sin UTM)'`) · `utmCompleta(u)` (las 5 claves, `''` si no son string) · `limpiarUtm(u)` (lo que llega del form: las 5, `texto(v, 300)` y `normUtm`) · `webinarEnLanding() → doc\|null` (el activo) · `preguntasDe(landing) → [{id, texto, opciones, calificadas}]` (las que se pueden contestar: id seguro y único, al menos una opción, máx. 8 opciones, `calificadas` dentro de `opciones`; las usan `/api/publico` y los dos pasos de `/api/registro`) · `cargarRegistros({w}?) → doc[]` · `calificar(preguntas, respuestas) → true\|false\|null` · `resumen(regs, zona) → {total, calificados, respondieron, porDia:{dia:n}, porDiaCal:{dia:{n,cal}}, porFuente:{src:n}, porFuenteDet:{src:{n,cal,resp}}, envios}` (`src` = `utm_source` con trim, vacío = `'(sin UTM)'`; un `respondio` que falta cuenta si hay respuestas; días en orden) · `cruceDe(reg) → {w, utm, respuestas, calificado, creado}` |
| `envios.mjs` (P2) | `despacharRegistro(reg, {evento:'Lead'\|'CompleteRegistration'}) → Promise<void>` · `procesarCola({max = 40, presupuestoMs = 25000}) → {procesados, errores, descartados}` (§7.15) · `MAX_INTENTOS` (5) |
| `pipeline.mjs` (P3) | `CAMPOS` (los de la fila, §4.3) · `cargarAgendas() → doc[]` · `indexarRegistros(regs) → {porEmail, porTel}` · `cruzar(agenda, indice) → registro\|null` · `aFila(agenda, registro) → Fila` · `personas(agendas) → Persona[]` (§7.4.3) · `capitalTramo(texto, tramos) → string` · `sincronizar({presupuestoMs = 20000}) → estado` (§7.5) · `enParalelo(items, n, fn) → Promise<void>` (corre `fn` sobre cada ítem, de a `n` a la vez; la usan el sync y `crmsync` para los `fusionarSi`, de a 8) · `BORRADAS` (`'agendas-borradas'`, el id del documento de `ajustes`) |
| `crm-core.mjs` (P4) | `kpis(ventas) → K` · `leaderboard(ventas, cuotas, metas) → {closers, equipo, metas, cuotas, total}` · `armarCierre(venta, plan, yo, neg, {ahora}?) → {venta, cuotas}` (pura; `ahora` deja a la semilla fijar el instante; tira 404, 400 o 409, §7.6.4) · `crmsync({previo}, yo) → {actualizados}` (`actualizados` = filas que de verdad se escribieron, §7.7.1) · ayudas que comparten `/api/crm` y finanzas: `SI`, `NO`, `n0` (`monto() ?? 0`), `r2`, `esPlano` (null, string o number), `TECHO` (1e12, el máximo de un monto), `idFijo(prefijo, ...partes)`, `nombresCloser(personas, otros)` y `canonico(mapa, nombre)` (§7.6.1), `UNIDADES`, `esUnidad`, `cashDe`, `MAX_HIST` (100), `agregarHist` |
| `atribucion.mjs` (P5) | `indiceCampanas(campanas, anuncios) → {anuncios: Map, campanas: Map}` · `asignar(registro, indice) → {campanaId, anuncioId}\|null` (`anuncioId` `null` si coincidió con la campaña) · `repartir(registros, indice) → {campanas: {id: {registros, calificados}}, anuncios: {…}, asignados}` (§7.10.5) |
| `icp-core.mjs` (P6) | `alcanceValido(w)` (`'todos'` o un id seguro) · `calcular({regs, ps, preguntas, campos})` (el cálculo de §7.9.1 sin leer la base) · `armarICP(w) → objeto de §7.9.1 sin w ni ia` (con `universo` y `textos` como propiedades no enumerables) · `contarPerfiles(perfiles, universo) → perfiles con n/compraron/cash` · `estadoIA(w, datos) → bloque ia` · `limpiarTexto(s, max = 300)` · `pedidoIA(datos)` · `validarIA(r, pedido)` (§7.9.2) |
| `integraciones/<x>.mjs` | `probar(cred) → {detalle, opciones?, elegir?, extra?}` — tira `Error(mensajeLegible)` si la clave no sirve. `cred` = `{clave, url?, cuenta?, pixel?, equipo?, lista?}`; `elegir` = selecciones automáticas (`{cuenta:'act_<n>'}` cuando hay una sola opción; `''` = la guardada ya no está y hay que elegir otra); `extra` = campos a guardar (`{org, usuario, moneda, cuentaNombre, …}`). El `probar` de meta vive en `meta-ads.mjs` (P5); el de `ia`, en `llm.mjs` |
| `integraciones/meta-capi.mjs` (P2) | `enviar(evento /* 'Lead'\|'CompleteRegistration' */, reg, integ, {hasta}?) → {ok:true, t} \| {ok:false, error, t}` (no tira; `hasta` = el instante, en ms, en que hay que cortar: lo usa la cola) · `eventoPrueba(testCode, integ) → void` (tira `Error` con el mensaje de Meta) — `integ = leerIntegracion('meta')` |
| `integraciones/activecampaign.mjs` (P2) | `probar(cred)` · `sincronizar(reg, webinar, integ, {hasta}?) → {ok:true, t} \| {ok:false, error, t}` (no tira) |
| `integraciones/meta-ads.mjs` (P5) | `probar(cred)` · `cuentaDe(s) → 'act_<n>'\|''` (acepta también el número solo) · `consultar(modo /* 'diario'\|'anuncios'\|'resumen' */, {desde, hasta, diario}, integ)` → objeto Meta normalizado, sin `ok`, `configurado` ni el bloque landing, con `atribucion = {campanas, anuncios}` como propiedad no enumerable · `datosDemo(modo, rango, negocio)` · `VIVOS_DEMO` y `ANUNCIOS_DEMO` (§7.10.6; los lee la semilla) |
| `integraciones/calendly.mjs` (P3) | `probar(cred)` · `traer({desde, hasta, presupuestoMs, vistos /* Map uri del evento → updated_at ya procesado */}, integ) → {reservas: Reserva[], parcial}` |
| `integraciones/iclosed.mjs` (P3) | `probar(cred)` · `traer({presupuestoMs}, integ, negocio) → {reservas: Reserva[], parcial}` (usa `negocio.zona` para un `dateTime` sin zona) |
| Las dos de calendarios | `Reserva = {fuenteId, CalendlyID, Nombre, Email, WhatsApp, inicio (ISO), Evento, Closer, Timestamp, cancelada, respuestas:[{pregunta, respuesta}], utm, eventoActualizado?, eventoUri?}`. El sync llama a las dos con `(opciones, integ, negocio)`. Si algo falla tiran `Error` con `e.reservas` = lo que ya había llegado (se guarda igual); los que tienen mensaje para la persona llevan `legible: true` (el sync muestra solo esos; cualquier otro sale como «… devolvió algo que no entiendo») |
| `integraciones/fathom.mjs` (P7) | `probar({clave, equipo})` · `MAX_EQUIPO` (120: el largo máximo de un equipo que acepta `conectar`) |
| `integraciones/llm.mjs` (P6) | `MODELO_DEFECTO` · `ESQUEMA_ICP` · `SISTEMA_ICP` · `probar({clave, modelo?, baseURL?, fetch?})` · `generarPerfiles(datos, clave, {modelo?, baseURL?, fetch?}?) → {perfiles, lectura, deseos, dolores}` tal cual los devolvió Claude (valida quien llama; §8.6) |

### 6.12 `scripts/dev.mjs` (P0)

- Requiere Node ≥ 22.12 (usa `fetch`, `Request`, `Response`, `Headers.getSetCookie`; el mínimo lo ponen
  `@netlify/functions` 6.0.3 y `@netlify/types` 3.3.0, y es el `engines` de `package.json`). Carga `.env` si existe
  (`CLAVE=valor`, acepta `export` adelante, comillas y comentarios `#`; **no pisa** lo que ya viene del entorno). Pone
  `NETLIFY_LOCAL` y `NETLIFY_DEV` en `'true'` si no vienen (así `purgeCache` no falla y `enNetlify()` da `false`,
  §6.4). Puerto `PORT` (8888).
- Al arrancar importa cada `netlify/functions/*.mjs` y arma la tabla: si `config.path` (string o array) existe,
  esas rutas (se soportan rutas exactas y el comodín final `/*`); si no tiene `path` ni `schedule`, la ruta
  `/.netlify/functions/<nombre de archivo sin .mjs>`. Igual que Netlify: con `path`, la ruta por defecto **no** existe.
- `config.method` se respeta (405 si no está).
- Background (nombre que termina en `-background` o `config.background`): responde `202` vacío enseguida y corre el
  handler sin esperarlo, atrapando y logueando errores.
- Programadas (`config.schedule`): no se exponen por URL; se disparan a mano con `POST /__cron/<nombre>` (solo en dev)
  y, si `DEV_CRON=1`, cada N minutos según una lectura simple del cron (`*/N * * * *`, `@hourly`, `@daily`; otra
  forma solo a mano).
- Request: `new Request('http://localhost:PORT' + url, {method, headers, body, duplex:'half'})`. Context:
  `{ ip: x-nf-client-connection-ip || '127.0.0.1', geo: {country: {code: DEV_PAIS || 'AR'}}, params: {}, site: {url: origen},
  deploy: {context: 'dev'}, requestId, cookies: {get, set, delete}, waitUntil(p) }` (`waitUntil` no bloquea; loguea
  errores). El header de la IP deja que las pruebas usen una IP por caso (en Netlify lo pone el borde).
- `context.cookies.get`: el `decodeURIComponent` de cada cookie va en `try/catch`; si falla, queda el valor crudo (una
  cookie ajena como `otra=%E0%A4%A` no tumba las funciones con 500).
- Respuesta: copia status y headers; los `Set-Cookie` múltiples con `headers.getSetCookie()`. Un cuerpo de más de
  10 MB → `413`; una función que tira (sin `manejar`) → `500` en texto plano.
- Estáticos desde `public/` (solo `GET` y `HEAD`): `/` → `index.html`; `/gracias` → `gracias.html` (la reescritura de
  `netlify.toml`); `/app/` → `app/index.html`; carpeta sin barra final → `301` a la misma con barra; carpeta →
  `index.html`; una ruta sin extensión prueba con `.html`; tipos por extensión (`.html .js .mjs .css .json .svg .png
  .jpg .gif .ico .webp .woff .woff2 .txt .ics .mp4 .map`); `cache-control: no-cache`; 404 texto plano.

---

## 7. Endpoints, función por función

### 7.1 Convenciones comunes

- Todas responden `Content-Type: application/json; charset=utf-8` y `Cache-Control: no-store`, salvo `/api/publico` (§7.11).
- Éxito: `2xx` con `{ok: true, ...}` (excepto donde se indica otra forma por compatibilidad: el POST de
  `/api/agendas-sync`, `/api/meta-ads` y `/api/registro` igual llevan `ok:true`, que el frontend ignora).
- Error: status no 2xx y `{ok: false, error: "<texto legible>"}`. Sin sesión: `401 {error: MENSAJE_401}` (rápido y sin
  efectos: el frontend pinta pantallas antes de validar la sesión). Rol sin permiso: `403` (nunca 401: cerraría la sesión).
- Validación de entrada fallida: `400 {error}`. Recurso inexistente: `404 {error}`. Conflicto: `409 {error, ...}`.
- Las funciones con `config.method` responden `405 {error:'Método no permitido'}` a otros métodos.
- Los `GET` son idempotentes y baratos: el frontend los repite (doble render por cambio de hash, `visibilitychange`).

### 7.2 `netlify/functions/acceso.mjs` — `/api/acceso` (P1)

`config = { path: '/api/acceso', method: ['POST'] }`. Cuerpo `{accion, ...}`, de hasta 8 KB.

#### `entrar`

Request: `{"accion":"entrar","clave":"ABCD-2345"}` (la clave puede venir en minúsculas, sin guion o con espacios; una
`clave` que no es string cuenta como vacía).

1. Límite (§5.1): suma 1 en `limites/acc:<ip>:<ventana>` antes de mirar nada; si pasa de `ACCESO_LIMITE` →
   `429 {error:'Demasiados intentos. Probá de nuevo en unos minutos.'}` (salvo la excepción de §5.1).
2. `normalizarCodigo`; si es inválido → `401 {error:'Código inválido o dado de baja'}` (el intento queda sumado).
3. Buscar persona activa con ese `codigoHash` (y un `rol` de `ROLES`); si no hay, regla de arranque (§5.3); si
   tampoco → `401` igual.
4. Ingreso correcto: el intento se resta y se escribe `ultimoIngreso = ahora` con
   `fusionarSi('personas', id, {ultimoIngreso})` (§6.2: solo si el documento sigue existiendo). Si da `null` (la
   persona se borró entre la búsqueda y la escritura) → `401 {error:'Código inválido o dado de baja'}`: con `fusionar`
   quedaría un documento con solo `ultimoIngreso`. Si no, responder con `Set-Cookie: <cookieSesion>`:

```json
{ "ok": true, "yo": { "uid": "u_lq3k9x2ab3cd", "nombre": "Ana Pérez", "rol": "equipo",
  "pantallas": ["ceo","anuncios","utms","traza","icp","registros","landing","embudos","closers","central","analisis",
                "pipeline","llamadas","precall","crm","finanzas","kpis","webinar","conexiones","equipo"] } }
```

#### `yo`

Request `{"accion":"yo"}`. Con sesión → `200 {ok:true, yo: yoPublico(yo)}` (y `Set-Cookie` renovada si `quedaPoco`).
Sin sesión → `401 {error:'Sin sesión'}` (boot muestra el gate limpio).

#### `salir`

Request `{"accion":"salir"}`. Siempre `200 {ok:true}` con `Set-Cookie: <cookieBorrar>`. No requiere sesión.

Otra `accion` → `400 {error:'Acción desconocida'}`.

### 7.3 `/api/app` — acciones (P1, P2, P7)

Todas `POST /api/app` con `{accion, ...}` por el despachador de §6.10.

#### 7.3.1 `inicio` (T) — `lib/app/webinars.mjs`

Request `{"accion":"inicio"}`. Lo pide base.js y otra vez mhq.js: tiene que ser barato (4 lecturas en paralelo:
`ajustes/negocio`, que `negocio()` y `opciones()` comparten con su caché de 30 s, `webinars`, `integraciones/meta` y
`ajustes/estado`).

```json
{
  "ok": true,
  "cliente": { "nombre": "Academia Faro", "color": "#2563eb", "moneda": "USD", "zona": "America/Bogota",
               "locale": "es-AR", "pais": "CO", "prefijoTel": "57", "horaPorDefecto": "20:00" },
  "yo": { "uid": "u_lq3k9x2ab3cd", "nombre": "Ana Demo", "rol": "equipo" },
  "webinars": [
    { "id": "w20261104k3x9", "nombre": "Clase en vivo · noviembre", "fecha": "2026-11-04", "hora": "19:00", "popup": null },
    { "id": "w20261017a1b2", "nombre": "Clase en vivo · octubre",   "fecha": "2026-10-17", "hora": "19:00",
      "popup": { "fecha": "2026-10-19", "hora": "19:00" } }
  ],
  "webinarActivo": "w20261104k3x9",
  "metaPrueba": false,
  "opciones": {
    "formatos": ["Masterclass en vivo", "Webinar con Q&A", "Taller práctico", "Clase grabada"],
    "cierres": ["Llamada", "Checkout", "Checkout + llamada"],
    "vara": { "presupuesto": null, "registros": null, "pctCalificados": 30, "pctAsistencia": 25, "pctAgenda": 3,
              "pctShow": 65, "pctCierre": 20, "ticket": null, "roasObjetivo": 3, "llamadasPorCloser": 7, "diasLlamadas": 4 },
    "roles": { "equipo": "Equipo", "cliente": "Cliente", "closer": "Closer" },
    "origenesPauta": ["MASTERCLASS", "WEBINAR"]
  }
}
```

- `webinars` **siempre array** (puede ser `[]`), ordenado por `fecha` y `hora` **descendente** (es el orden del selector; `/api/tablero` usa ascendente). Cada uno trae solo `{id, nombre, fecha, hora, popup}`; `popup` es `null` si no tiene una fecha válida, y sin hora propia lleva la del vivo.
- `webinarActivo`: `ajustes/estado.webinarActivo` si existe ese webinar; si no, `null`.
- `metaPrueba` = la integración meta tiene `testCode` no vacío.
- `yo` **obligatorio** (mhq.js:16). `cliente.moneda` y `cliente.zona` siempre válidos (los valida `negocio()`).
- `cliente.horaPorDefecto` (`'HH:MM'`) = `negocio().horaPorDefecto` (`ajustes/negocio.horaPorDefecto`, si no
  `WEBINAR_HORA`, si no `'20:00'`; una hora inválida cae en `'20:00'`). Es la hora que propone el formulario «Nuevo
  webinar» para el vivo y para el pop-up (E-43); también le llega al closer.

#### 7.3.2 `webinar` (T)

Request `{"accion":"webinar","id":"w20261104k3x9"}`. No existe → `404 {error:'No existe ese webinar'}`.
Responde la **Ficha**:

```json
{
  "ok": true,
  "webinar": {
    "id": "w20261104k3x9", "nombre": "Clase en vivo · noviembre", "fecha": "2026-11-04", "hora": "19:00",
    "popup": null, "formato": "Masterclass en vivo", "cierre": "Llamada", "ventana": 10,
    "etiqueta": "webinar-2026-11-04", "duracionMin": 180,
    "proyeccion": { "presupuesto": 1500, "registros": 1200, "ticket": 900 },
    "tareas": [ { "id": "tq3k9x2", "bloque": "Fase 0 · Estrategia", "texto": "Definir la promesa y a quién le habla la clase",
                  "vence": "2026-10-05", "hecha": true, "offset": -30 } ],
    "landing": { "...": "§7.3.4, con preguntas[].id/opciones/calificadas" }
  },
  "proyeccion": { "entrada": { "presupuesto": 1500, "registros": 1200, "pctCalificados": 30, "pctAsistencia": 25,
                               "pctAgenda": 3, "pctShow": 65, "pctCierre": 20, "ticket": 900, "roasObjetivo": 3,
                               "llamadasPorCloser": 7, "diasLlamadas": 4 },
                  "cpl": 1.25, "calificados": 360, "cplCalificado": 4.1667, "asistentes": 300, "agendas": 36,
                  "costoAgenda": 41.6667, "llamadas": 23.4, "ventas": 4.68, "cash": 4212, "roas": 2.808,
                  "cashObjetivo": 4500, "ventasParaObjetivo": 5, "closers": 2 },
  "progreso": { "hechas": 6, "total": 24, "vencidas": 3, "pct": 25 },
  "activo": true
}
```

`progreso.pct = round(100 × hechas / total)` (0 si no hay tareas); `vencidas` = no hechas con `vence < hoyLocal(zona)`.
`webinar` sale normalizado y sin `v`: `popup` como en `inicio`; `ventana` 10 si falta; `etiqueta` `webinar-<fecha>`
si falta; `proyeccion` = `parsearEntrada(lo guardado)`; `tareas` = `ordenar(…)`; `landing` = `completarLanding(…)`
(todas las claves y tipos, §6.11). `proyeccion` (arriba) = `calcular(webinar.proyeccion, opciones().vara)`.
`webinar.duracionMin` = `duracionDe(w, negocio())` (§6.11): la misma que publican `/api/publico` y que usa `/api/registro`
para cerrar el alta.

#### 7.3.3 `proyectar` (T) y la proyección

Request: `{"accion":"proyectar","proyeccion":{"presupuesto":"1500","registros":"","pctCierre":"22,5", ...}}` (las 11
claves como strings; `''` = vacío; coma o punto decimal). No guarda. Responde
`{ok:true, proyeccion: calcular(parsearEntrada(cuerpo.proyeccion), opciones().vara)}`. Cómo se lee cada string
(`parsearEntrada`, §6.11): los montos (`presupuesto`, `registros`, `ticket`) con `monto()`, así `'1.500'` = 1500; las
tasas toman el último `,` o `.` como decimal (`'22,5'` = 22.5, `'1,125'` = 1.125); lo negativo o no numérico se omite
(usa la vara).

Las 11 claves (`CLAVES_PROY`): `presupuesto, registros, pctCalificados, pctAsistencia, pctAgenda, pctShow, pctCierre,
ticket, roasObjetivo, llamadasPorCloser, diasLlamadas` (porcentajes 0–100).

`calcular(guardada, vara)`: para cada una de las 11 claves, `E[k]` = el valor guardado si es un número ≥ 0 (con la
misma lectura de `parsearEntrada`), si no el de la vara, si no `null` (siempre las 11 en `entrada`, `number|null`).
Cualquier operando `null`, división por 0 o resultado no finito da `null` (nunca `NaN`). Las **cantidades**
(`calificados`, `asistentes`, `agendas`, `llamadas`, `ventas`) se redondean al entero más cercano (`round`), y cada una
sale de la anterior ya redondeada: así la pantalla, que las muestra sin decimales, cierra a mano (`cash` = las ventas
que se ven × ticket; con decimales, 400 registros y un ticket de 450.000 mostraban «Ventas 2 · Cash 702.000», y el
avance del Inicio daba 64 % con 1 de 2 ventas). Los montos y cocientes (`cpl`, `cplCalificado`, `costoAgenda`, `cash`,
`roas`, `cashObjetivo`) no se redondean. Los `ceil` restan `1e-9` antes (así `4500 / 900` da 5 y no 6 por la coma
flotante). Con la demo (W3: 1.800, 1.400 registros, ticket 900 y la vara) da 42 agendas, 27 llamadas, 5 ventas, cash
4.500 y 2 closers.

| Campo | Fórmula |
|---|---|
| `cpl` | presupuesto / registros |
| `calificados` | round(registros × pctCalificados / 100) |
| `cplCalificado` | presupuesto / calificados |
| `asistentes` | round(registros × pctAsistencia / 100) |
| `agendas` | round(registros × pctAgenda / 100) |
| `costoAgenda` | presupuesto / agendas |
| `llamadas` | round(agendas × pctShow / 100) |
| `ventas` | round(llamadas × pctCierre / 100) |
| `cash` | ventas × ticket |
| `roas` | cash / presupuesto |
| `cashObjetivo` | presupuesto × roasObjetivo |
| `ventasParaObjetivo` | ceil(cashObjetivo / ticket) |
| `closers` | ceil(agendas / (llamadasPorCloser × diasLlamadas)) |

#### 7.3.4 La landing guardada y su parseo

Forma guardada (`webinar.landing`, la misma que publica `/api/publico` salvo `calificadas`):

```json
{
  "eyebrow": "Clase gratuita en vivo",
  "titulo": "Tu promesa en una línea y *el resultado en el color de la marca*",
  "subtitulo": "…", "cta": "Reservar mi lugar gratis", "microcopy": "El acceso al directo te llega por WhatsApp.",
  "piezasTitulo": "Lo que vas a ver en la clase",
  "piezas": [ { "titulo": "Tema 1", "texto": "Qué se lleva la persona." } ],
  "regalo": { "titulo": "", "texto": "" },
  "paraQuien": ["…"], "noParaQuien": ["…"],
  "presentador": { "nombre": "…", "bio": "…", "foto": "https://…", "numeros": ["+10 años enseñando"] },
  "faq": [ { "titulo": "¿Cuánto cuesta?", "texto": "Nada. Es gratuita y en vivo." } ],
  "cierre": "Una clase. En vivo. Una sola vez.", "disclaimer": "…",
  "video": "https://youtu.be/…", "whatsapp": "https://chat.whatsapp.com/…", "pasoMail": "",
  "preguntas": [ { "id": "cuanto-podes-invertir", "texto": "¿Cuánto podés invertir en tu formación?",
                   "opciones": ["Nada por ahora", "Menos de 500", "500 a 1.000", "Más de 1.000"],
                   "calificadas": ["500 a 1.000", "Más de 1.000"] } ]
}
```

`parsearLanding(form, guardada)` (form = lo que manda el editor, mhq.js:510-516; acepta también la forma ya
parseada, para ser idempotente). Una clave que no viene en el form (`undefined`) se toma de la guardada; `regalo` y
`presentador` se fusionan campo por campo con los guardados. Un objeto o array donde va un texto cuenta como `''`:

| Campo | Llega como | Regla |
|---|---|---|
| `eyebrow, titulo, subtitulo, cta, microcopy, piezasTitulo, cierre, disclaimer, pasoMail` | string | `texto(s, 2000)` |
| `whatsapp`, `video`, `presentador.foto` | string | `httpsUrl`; `''` queda `''`; lo que no es https → `400` con `'El link de WhatsApp tiene que empezar con https://'`, `'El link del video …'` o `'El link de la foto …'` (en `landingPublica` y `completarLanding`, `''` sin error) |
| `regalo` | `{titulo, texto}` | textos |
| `presentador` | `{nombre, bio, foto, numeros}` | `numeros`: string por líneas o array → líneas no vacías, máx. 4 |
| `piezas` (máx. 4), `faq` (máx. 8) | string `"titulo \| texto"` por línea, o array (de esas líneas o de `{titulo, texto}`) | cortar en `\n`, `trim`, sin vacías; cada línea se parte en el **primer** `\|`: antes = `titulo`, después = `texto` (`''` si no hay); se descartan las que quedan sin título ni texto |
| `paraQuien`, `noParaQuien` | string por líneas o array | líneas no vacías |
| `preguntas` | array `[{texto, opciones: "línea\n* línea"}]` (solo las de texto no vacío) | máx. 3; `opciones` por línea (máx. 8, sin repetidas); una línea que empieza con `*` va a `opciones` **y** a `calificadas` sin `/^\*\s*/` (en la forma ya parseada también cuenta el array `calificadas`); el `id` sale así (R-03): 0) en la forma ya parseada, el `id` que trae, si pasa `idSeguro` y no está repetido; 1) si `norm(texto)` es igual al de una pregunta guardada no usada, conserva ese `id`; 2) si no, y la cantidad de preguntas es la misma que la guardada, toma el `id` de la guardada en la **misma posición** que no se haya usado en 1 (es un cambio de texto); 3) si no, `slug(texto)` (`'pregunta'` si queda vacío; si se repite, `-2`, `-3`). El editor manda solo las preguntas con texto (mhq.js:511-512), así que vaciar la del medio corre la lista: la regla 1 evita que una pregunta herede el `id` (y las respuestas viejas) de otra. Siempre `opciones: []` y `calificadas: []` como arrays |
| claves sueltas (`p3`, `p4`…) o desconocidas | — | se descartan |

Guardar la landing purga el caché del público (`purgeCache({tags:['publico']})` envuelto en try/catch; en dev no hace nada).

`LANDING_DEFECTO` (P1): la de arriba con textos genéricos (sin cifras, sin nichos), una pregunta de ejemplo
"¿Cuánto podés invertir en tu formación?" con dos opciones calificadas, `whatsapp: ''`, `video: ''`.

#### 7.3.5 `guardarWebinar` (E/C)

Siempre `{accion:'guardarWebinar', webinar:{...}}` y **siempre responde la Ficha completa** (7.3.2).

| Uso | Se detecta por | Body `webinar` | Qué hace |
|---|---|---|---|
| Crear | sin `id` (o `''`) | `{nombre, fecha, hora, popup:{fecha,hora}\|null}` | valida `nombre` 1–120 (`400 'Poné el nombre del webinar'` / `'El nombre puede tener hasta 120 caracteres'`), `fecha` (`esFecha`, si no `400 'Elegí la fecha del vivo'`), `hora` (acepta `H:MM` y `HH:MM:SS`, queda `HH:MM`; inválida → `400 'Revisá la hora del vivo (HH:MM)'`; vacía → `horaPorDefecto`) y `popup` (fecha inválida → `400 'Revisá la fecha del pop-up'`, hora inválida → `400 'Revisá la hora del pop-up (HH:MM)'`). Un objeto o array donde va un texto → el mismo 400 del campo. Genera `id` (`w` + fecha sin guiones + 4 `[a-z0-9]`, hasta que no exista). Defaults: `formato = formatos[0]`, `cierre = cierres[0]`, `ventana = 10`, `etiqueta = 'webinar-' + fecha`, `duracionMin = negocio.duracionMin`, `proyeccion = {}`, `landing` = `completarLanding` de una copia de la del webinar activo (o de `LANDING_DEFECTO` si no hay), `tareas = armarTareas(fecha, 10)`, `v = 0`. Si no hay webinar activo, este queda activo (y se purga el caché del público). |
| Datos | `id` y ni `proyeccion` ni `landing` | `{id, nombre, fecha, hora, popup, formato, cierre, ventana:"7", etiqueta, duracionMin?}` | cambia solo las claves que vienen (`!== undefined`), con las mismas validaciones de Crear. `duracionMin`, si viene, entero 30–600 (como número o dígitos; si no, `400 {error:'La duración va de 30 a 600 minutos'}`). `ventana` → entero 1–60 (número o dígitos: `'7'` sí, `'7.5'` o `'1e1'` no; si no, `400 {error:'La ventana va de 1 a 60 días'}`); `formato`/`cierre` tienen que estar en `opciones` (si no, `400 'Elegí un formato de la lista'` / `'Elegí un cierre de la lista'`); `etiqueta` → `slug` (vacía → `webinar-<fecha>`); `hora` vacía conserva la que había; `popup` con `fecha` vacía → `null`; `popup` con fecha y sin hora → hora del vivo. **Si cambia `fecha`, todas las `tareas[].vence` se corren `difDias(vieja, nueva)` días.** |
| Proyección | `id` + `proyeccion` | `{id, proyeccion:{11 claves string}}` | `webinar.proyeccion = parsearEntrada(...)` (reemplaza; `''` borra la clave) |
| Landing | `id` + `landing` (objeto; si no, `400 'Pedido inválido'`) | `{id, landing: LandingForm}` | `webinar.landing = parsearLanding(form, guardada)`. `proyeccion` y `landing` pueden venir en el mismo pedido: se aplican las dos en una sola escritura |

Todo cambio a un webinar que existe va por el bloqueo optimista (lee, aplica sobre una copia y escribe con
`reemplazarSiVersion` y `v + 1`). Guardar datos o landing del webinar activo purga el caché del público (guardar solo
la proyección, no). Un `webinar` que no es objeto → `400 {error:'Pedido inválido'}`.

Errores: `404 {error:'No existe ese webinar'}`, `400` de validación, `409 {error:'Alguien más estaba guardando este
webinar: probá de nuevo'}` si el bloqueo optimista no entra (§4.3 `webinars.v`).

#### 7.3.6 `activar` y `borrarWebinar` (E/C)

- `activar {id}`: el webinar tiene que existir (404). `fijarWebinarActivo(id)`, purga el caché del público. → `{ok:true}`.
- `borrarWebinar {id}`: borra el doc (los registros quedan con su `w` y siguen contando en "todos"; se borran también
  `webinar-asistencia/<id>` e `icp-ia/<id>`). Si era el activo, pasa a activo el próximo webinar con `fecha >= hoy`
  (el más cercano), si no hay el más reciente, si no `null`. → `{ok:true}`.

#### 7.3.7 `tarea` (E/C)

| Variante | Body | Efecto |
|---|---|---|
| Marcar | `{id, tarea:'<tid>', hecha:true\|false}` | `hecha` queda `true` solo con `true`; `404 {error:'No existe esa tarea'}` si no existe la tarea |
| Borrar | `{id, borrar:'<tid>'}` | si no existe, no pasa nada |
| Nueva | `{id, nueva:{texto, bloque, vence}}` | `texto` 1–200 (`400 'Escribí la tarea'` / `'La tarea puede tener hasta 200 caracteres'`); `bloque` hasta 80, vacío → `'Otras'`; `vence` vacío, inválido o que no es texto → `webinar.fecha`; `offset: null`; un bloque nuevo va al final |

Cualquier otro cuerpo → `400 {error:'Pedido inválido'}`. Va con el mismo bloqueo optimista de 7.3.5 (varios tildes
seguidos entran todos). Responde `{ok:true, tareas: ordenar(tareas), progreso}`. `ordenar`: primero los bloques de la
plantilla en el orden de las fases; después los otros (p. ej. `Otras`), en el orden en que aparecen; dentro de cada
bloque por `vence` (estable).

Plantilla `armarTareas(fecha, ventana)` (P1) — texto propio y genérico, 8 bloques en este orden; `vence = sumarDias(fecha, offset)`:

| Bloque | Tareas (offset en días respecto del vivo) |
|---|---|
| `Fase 0 · Estrategia` | Definir la promesa y a quién le habla la clase (−30) · Definir la oferta del final y su precio (−28) · Cargar la proyección del webinar (−27) |
| `Fase 1 · Landing y registro` | Escribir la landing y las preguntas de calificación (−24) · Conectar el píxel y probar los eventos (−22) · Crear el grupo de WhatsApp y cargar el link (−21) · Probar el registro de punta a punta (−20) |
| `Fase 2 · Mails y recordatorios` | Secuencia de confirmación en el email marketing (−19) · Recordatorios de 24 h, 1 h y "estamos en vivo" (−17) · Video para la página de gracias (−15) |
| `Fase 3 · Anuncios` | Grabar los creativos (−21) · Armar las campañas con UTM (−18) · Lanzar los anuncios (−14) |
| `Fase 4 · Captación` | Revisar costo por registro y calificados cada día (−10) · Contenido orgánico de la semana del vivo (−7) · Ajustar presupuesto según el costo por registro (−3) |
| `Fase 5 · Presentación` | Guion de la clase y de la oferta (−10) · Ensayo completo (−3) · Prueba técnica de la plataforma de transmisión (−1) |
| `Fase 6 · El vivo` | Abrir la sala 15 minutos antes (0) · Cargar la asistencia en el Inicio (1) |
| `Fase 7 · Cierre y seguimiento` | Llamar a las agendas en menos de 24 h (1) · Seguimiento a los que no agendaron (2) · Cargar ventas y planes de pago en Ventas (3) · Revisión: qué funcionó y qué no (`ventana`) |

#### 7.3.8 `registros` (E/C) — `lib/app/registros.mjs` (P2)

Request `{"accion":"registros","id":"w20261104k3x9"}` (webinar inexistente → 404).

```json
{
  "ok": true,
  "total": 248,
  "porDia": { "2026-10-20": 31, "2026-10-21": 44 },
  "porFuente": { "fb": 160, "ig": 52, "email": 12, "(sin UTM)": 24 },
  "calificados": 61,
  "respondieron": 150,
  "envios": { "ac": { "ok": 0, "mal": 0 }, "meta": { "ok": 0, "mal": 0 } },
  "filas": [
    { "creado": "2026-10-21T22:14:03.120Z", "nombre": "Mariana Ruiz", "email": "mariana.ruiz@example.com",
      "whatsapp": "+573001234567",
      "utm": { "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "webinar-noviembre", "utm_content": "anuncio-2", "utm_term": "" },
      "calificado": true, "ac": null, "meta": { "ok": false, "error": "Token vencido" } }
  ]
}
```

- `porDia`: claves `registro.dia` (zona del negocio; si falta, el día local de `creado`). `porFuente`: clave
  `utm.utm_source` con trim, `'(sin UTM)'` si está vacía. Es `resumen(regs, zona)` (§6.11).
- `envios.ac.ok` = `ac.ok === true`; `mal` = `ac && ac.ok === false` (igual para `meta`).
- `filas`: **todas** las del webinar, la más nueva primero, solo esos campos (sin respuestas ni datos técnicos);
  `whatsapp` siempre string; `creado` ISO válido (uno roto sale como `1970-01-01T00:00:00.000Z`). Para no acercarse a
  los 6 MB, cada UTM sale recortada a 100 caracteres (las 5 claves siempre, `''` si falta) y `ac`/`meta` salen como los
  pinta la tabla: `null`, `{ok:true}` o `{ok:false, error}` (el error hasta 120 caracteres, `'Falló el envío'` si no
  hay).

#### 7.3.9 `integraciones` (E/C) — `lib/app/integraciones.mjs` (P7)

Request `{"accion":"integraciones"}`. **Exactamente** las 6 claves (más `ok`), cada una `estadoPublico(cual)`.
Sin llamadas externas (lee lo guardado).

```json
{
  "ok": true,
  "meta":     { "estado": "incompleta", "detalle": "Token …a1b2 · elegí la cuenta y el píxel", "error": "",
                "falta": ["la cuenta publicitaria", "el píxel"], "clave": "…a1b2", "cuenta": "", "pixel": "", "testCode": "" },
  "calendly": { "estado": "sin", "detalle": "", "error": "", "falta": [], "clave": "" },
  "iclosed":  { "estado": "ok", "detalle": "Conectada (variable de entorno)", "error": "", "falta": [], "clave": "…9f3c" },
  "fathom":   { "estado": "sin", "detalle": "", "error": "", "falta": [], "clave": "", "equipo": "" },
  "ia":       { "estado": "error", "detalle": "", "error": "La clave no es válida", "falta": [], "clave": "…77de" },
  "ac":       { "estado": "sin", "detalle": "", "error": "", "falta": [], "clave": "", "url": "", "lista": "" }
}
```

Estado (`estadoPublico`): sin clave → `sin`; doc con `estado:'error'` → `error` (con el `error` guardado, o
`'La clave no es válida'`); faltan requisitos (`REQUISITOS`) → `incompleta` con `falta` = etiquetas y, si no hay
`detalle` guardado, `'Token …xxxx · elegí <lo que falta>'` (`'Clave …'` fuera de meta); si no → `ok` (`detalle`
guardado o `'Conectada'`). Los campos de cada servicio van siempre presentes, como string. Con origen `env`, `detalle`
termina en `" (variable de entorno)"`. En `DEMO_META`, meta = `ok`, `detalle: 'Modo demo'`, `clave: '…demo'`.

#### 7.3.10 `conectar` (E/C)

Request: `{accion:'conectar', cual, clave, url?, cuenta?, pixel?, equipo?, lista?}` (`''` = no elegido / reusar).

1. `cual` ∉ `INTEGRACIONES` → `400 {error:'Esa integración no existe'}`. Meta en modo demo → el 400 de abajo.
2. `clave = cuerpo.clave` (sin espacios de los bordes ni caracteres invisibles de ancho cero) `|| clave guardada || clave
   de env`. Ninguna → `400 {error:'Pegá la clave'}`; más de 4000 caracteres → `400 {error:'Esa clave es demasiado
   larga: pegá solo la clave'}`.
   `ac`: `url = cuerpo.url || guardada || env`, normalizada al origen; tiene que ser `https://…` → si no,
   `400 {error:'Pegá la URL de la API de ActiveCampaign'}`.
   Las selecciones del cuerpo que no están vacías se validan: `cuenta` `/^act_\d{1,30}$/` (`'Elegí la cuenta
   publicitaria de la lista'`), `pixel` y `lista` con `idSeguro` (`'Elegí el píxel de la lista'`, `'Elegí la lista de
   ActiveCampaign'`), `equipo` hasta `MAX_EQUIPO` caracteres (`'Elegí el equipo de la lista'`); todas `400`.
3. `r = await integraciones/<cual>.probar({clave, url, cuenta, pixel, equipo, lista})` con las selecciones del cuerpo
   o, si vienen vacías, las guardadas. Antes, la clave tiene que ser ASCII visible (con un espacio o un invisible
   adentro, `fetch` no arma el header): si no, falla con un mensaje que dice de dónde vino la clave. Todo `probar`
   tiene 40 s; si no termina, `'El servicio no respondió: probá de nuevo'`.
4. **Si falla:** con clave nueva → no se guarda nada, `400 {error: e.message}`; reusando la guardada → se guarda
   `{estado:'error', error: e.message, probado}` y `400 {error: e.message}`. El mensaje sale sin la clave adentro
   (aunque el servicio la repita) y hasta 300 caracteres.
5. **Si anda:** guardar `{clave (si es nueva), ...selecciones del cuerpo no vacías, ...r.elegir, ...r.extra, estado, error:'', detalle: r.detalle (o 'Conectada'), probado}`
   (`elegir` y `extra` no pueden pisar `clave`, `estado`, `error`, `detalle`, `probado` ni `testCode`; `estado` = `ok`
   o `incompleta` según `REQUISITOS`, medido otra vez sobre lo que quedó guardado, porque lo vaciado vuelve a la
   variable de entorno si la hay). Si cambió la cuenta de Meta y el píxel guardado no está en la lista nueva, se
   borra el píxel (y su nombre); si el píxel cambió o se vació, se borra también el `testCode` (es de un píxel, §7.3.12).
   ActiveCampaign: la URL se guarda normalizada al origen (`https://<cuenta>.api-us1.com`, sin `/api/3` ni barra
   final) y los ids de etiquetas (`tags`) se vacían **solo si cambió la cuenta**: la URL nueva se compara contra la
   guardada (o la de `AC_URL`) también normalizada, así reconectar la misma cuenta con la URL escrita de otra forma
   conserva las etiquetas.
6. Responder `{ok:true, detalle, opciones: r.opciones}` (`opciones` se omite si el servicio no tiene; los `id` van
   como string).

Con `DEMO_META=1`, `conectar {cual:'meta'}` responde `400 {error:'Meta está en modo demo: sacá DEMO_META del entorno
para conectar una cuenta real'}` sin probar nada.

| `cual` | `probar` llama a | `opciones` | Autoelección (`elegir`) |
|---|---|---|---|
| `meta` | `GET /me/adaccounts?fields=name,account_id,currency,timezone_name&limit=100`; si hay cuenta elegida o única, `GET /act_<id>/adspixels?fields=id,name&limit=100` | `{cuentas:[{id:'act_<account_id>', nombre, moneda}], pixeles:[{id, nombre}]}` (`pixeles: []` hasta que haya cuenta) | cuenta si hay 1; píxel si hay 1 |
| `calendly` | `GET https://api.calendly.com/users/me` (Bearer) | — | `extra: {org: resource.current_organization, usuario: resource.name}` |
| `iclosed` | `GET https://public.api.iclosed.io/v1/eventCalls?eventType=UPCOMING&limit=1&page=0` (Bearer) | — | — |
| `fathom` | `GET https://api.fathom.ai/external/v1/teams` (`X-Api-Key`) | `{equipos:['Ventas', ...]}` (strings) | equipo si hay 1 |
| `ia` | `client.models.list({ limit: 1 })` del SDK | — | — |
| `ac` | `GET <url>/api/3/lists?limit=100` (`Api-Token`) | `{listas:[{id:'3', nombre}]}` (ids como string) | lista si hay 1 |

`detalle` de ejemplo: meta `"Cuenta Academia Faro · USD · píxel Web"` (si `timezone_name` de la cuenta no es `negocio.zona`, se agrega `" · la cuenta usa <zona>"`: Meta corta los días en esa zona), calendly `"Usuario Ana Demo"`, iclosed
`"Conectada"`, fathom `"Equipo Ventas"`, ia `"Lista para el ICP (claude-opus-5-5)"`, ac `"Lista Webinar · 3"`.
Mensajes de error legibles: `"La clave no es válida"` (401/403), `"El servicio no respondió: probá de nuevo"` (red/5xx).

Tipos (R-04): todos los `id` de `opciones` (`cuentas[].id`, `pixeles[].id`, `listas[].id`) y todas las selecciones guardadas
(`cuenta`, `pixel`, `lista`, `equipo`) son **strings**: el modal marca la opción elegida con `x.id === actual` (mhq.js:371-372),
y un número contra un string deja el select en "Elegí…". Las opciones solo viven en la memoria de la página
(`E.opcInteg`): después de recargar, el modal no muestra los selects hasta que se toca "Guardar y probar" con la clave
vacía, que reusa la guardada y vuelve a devolver `opciones` (paso 2).

#### 7.3.11 `desconectar` (E/C)

`{accion:'desconectar', cual}` → `borrarIntegracion(cual)` (clave, selecciones y, en meta, `testCode`) →
`{ok:true, detalle}`, con `detalle` según lo que quedó después de borrar:

| Queda | `detalle` |
|---|---|
| nada | `'Desconectada'` |
| la variable de entorno | `'Borré lo guardado: sigue conectada con la variable de entorno'` |
| el modo demo de Meta | `'Borré lo guardado: Meta sigue en modo demo'` |

El modal muestra ese texto (E-44); con una respuesta sin `detalle`, `'Desconectada'`. Desconectar dos veces da 200 las dos.

#### 7.3.12 `probar` — modo prueba del píxel (E/C)

- `{accion:'probar', testCode:'TEST12345'}`: meta tiene que tener token y píxel (`400 {error:'Primero elegí el píxel'}`);
  `testCode` `/^[A-Za-z0-9]{4,30}$/` (si no: `400 {error:'Pegá el código de Eventos de prueba (letras y números)'}`; el
  input puede llegar vacío, mhq.js:453). Se guarda en `integraciones/meta.testCode` y se manda un evento `PageView` de
  prueba a la CAPI con `test_event_code` (§8.2). Si Meta lo rechaza → `400 {error: mensaje de Meta}` (el código igual
  queda guardado). → `{ok:true, detalle:'Mandé un evento de prueba: buscalo en Eventos de prueba del Administrador de eventos.'}`.
  **Mientras haya `testCode`, todos los eventos de registros reales salen con `test_event_code`.**
- `{accion:'probar', salir:true}`: borra `testCode` → `{ok:true, detalle:'Listo: los registros vuelven a contar para las campañas.'}`.
- Con `DEMO_META=1`, `probar {testCode}` responde `400 {error:'En modo demo no se manda nada a Meta: conectá una cuenta
  real para probar el píxel'}` antes de mirar el píxel (el status es el mismo 400 del contrato). `salir` anda igual.

#### 7.3.13 `personas` (E/C) — `lib/app/personas.mjs` (P1)

`{accion:'personas'}` → `{ok:true, personas:[{uid, nombre, rol, activo}]}` (solo las de un rol de `ROLES`), ordenado por rol (`equipo`, `cliente`, `closer`) y nombre (sin distinguir tildes ni mayúsculas). Nunca devuelve `codigoHash`.

#### 7.3.14 `persona` (E/C)

| Variante | Body | Reglas | Respuesta |
|---|---|---|---|
| Crear | `{crear:{nombre, rol}}` | `nombre` con trim y espacios simples, 2–60 (`400 'El nombre va de 2 a 60 caracteres'`); `rol` ∈ ROLES (`400 'Elegí el rol: equipo, cliente o closer'`); `cliente` no crea `equipo` (403 `'Solo el equipo puede sumar a alguien del equipo'`); nombre repetido entre activos (por `norm`) → `409 {error:'Ya hay alguien activo con ese nombre'}`. Se mira antes de escribir y otra vez después: si otra alta con el mismo nombre entró en el medio, esta se borra y da el mismo 409. Código libre (se chequea que nadie lo tenga), `v: 0` | `{ok:true, persona:{uid, nombre, rol, activo:true}, clave:'XXXX-XXXX'}` |
| Código nuevo / Reactivar | `{codigo:'<uid>'}` | `cliente` no toca a un `equipo` (403 `'Solo el equipo puede cambiar a alguien del equipo'`); si reactiva (estaba de baja) y ya hay otra activa con su nombre → 409 de nombre repetido; genera código, `activo:true`, `sesionVer+1`, con el bloqueo optimista. Si reactiva, después de escribir se vuelve a mirar el nombre: si otra con el mismo nombre se activó en el medio, se deshace con `fusionarSi('personas', uid, {activo:false, codigoHash:null, v: <la versión recién escrita> + 1})` (sin condición: solo si la persona sigue existiendo, así un rollback sobre alguien borrado no lo recrea) y responde el 409 de nombre repetido | `{ok:true, clave}` |
| Baja | `{baja:'<uid>'}` | no a uno mismo (`400 {error:'No te podés dar de baja a vos'}`, antes de buscarla); `cliente` no toca `equipo` (403); `activo:false`, `codigoHash:null`, `sesionVer+1` | `{ok:true}` |

Sin `crear`, `codigo` ni `baja` → `400 {error:'Pedido inválido'}`. uid inexistente (o que no pasa `idSeguro`) →
`404 {error:'No existe esa persona'}`. Regenerar un código cierra todas las sesiones de esa persona (`sesionVer + 1`). Si es **el
propio**, la respuesta trae además un `Set-Cookie` con la sesión nueva (la de la `sesionVer` nueva), así quien lo
regeneró no queda afuera; el frontend igual vuelve a entrar enseguida con el código nuevo (mhq.js:463), y ese `entrar`
pasa aunque la IP esté cortada por el límite (§5.1). Dos cambios a la misma persona a la vez: `409 {error:'Alguien más
le cambió el código: recargá Equipo'}` / `'Alguien más cambió a esta persona: recargá Equipo'` (§4.3 `personas.v`).

### 7.4 `/api/panel` — el pipeline de agendas (P0 despacha; P3 y P4 implementan)

#### 7.4.1 `GET /api/panel` (T) — `agendas.acciones.__listar`

Sin query ni cuerpo. Lo pide el boot, cada pantalla de Llamadas después de cada edición y en cada `visibilitychange`:
tiene que ser rápido (2 lecturas: `agendas` y `registros`, cruce en memoria). Si leer los registros falla, se loguea
y el pipeline sale igual, con `_registro: null` en todas las filas.

```json
{
  "ok": true,
  "estados": ["Pendiente","Confirmada","Re-agenda","Presentada","No-show","Cerrada","Cancelada","Descalificada"],
  "rows": [
    {
      "_row": "ag_lq3k9x2ab3cd", "_id": "ag_lq3k9x2ab3cd",
      "Nombre": "Mariana Ruiz", "WhatsApp": "+573001234567", "Email": "mariana.ruiz@example.com", "Instagram": "mariana.ruiz",
      "Fecha call": "2026-10-23", "Hora": "16:30", "Estado": "Cerrada", "Closer": "Laura Gómez", "Setter": "",
      "Monto": 900, "Programa": "Programa Insignia", "Fecha cierre": "2026-10-23", "Gatillo": "La clase del jueves", "Notas": "",
      "Capital": "1-2K", "Origen": "WEBINAR", "Evento": "Llamada de admisión", "Timestamp": "2026-10-21T23:02:11.000Z",
      "CalendlyID": "8b1f…", "Negocio": "Estudio contable", "Facturacion": "1.000 a 2.000", "Objetivo": "Sumar clientes",
      "Traba": "No tengo tiempo", "Urgencia": "Ya mismo", "Decisor": "Sí, decido solo",
      "_fuente": "calendly",
      "_registro": { "w": "w20261017a1b2",
                     "utm": { "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "webinar-octubre", "utm_content": "anuncio-2", "utm_term": "" },
                     "respuestas": { "cuanto-podes-invertir": "500 a 1.000" }, "calificado": true,
                     "creado": "2026-10-12T14:03:00.000Z" }
    }
  ]
}
```

- **`ok: true` es obligatorio** (ads.js:233 lo usa para saber que el pipeline llegó). `estados` siempre presente.
- Cada fila = `aFila(agenda, registro)`: todos los campos de §4.3 `agendas` (los ausentes salen `''`), `_row = _id = id`,
  `_fuente`, `_registro` (objeto o `null`). Campos internos (`fuenteId`, `eventoActualizado`, `eventoUri`, `utmAgenda`,
  `deFuente`, `canceladaFuente`, `creado`, `actualizado`) **no** salen. Orden: `Fecha call` asc, `Hora` asc (empate:
  `Timestamp`, después `_row`).
- `Monto`: number o `''`. `Fecha call` `YYYY-MM-DD` y `Hora` `HH:MM` locales; `Timestamp` ISO UTC.
- **Tamaño:** sin paginar. Si el JSON pasa los 4 MB y el pedido trae `Accept-Encoding: gzip`, la respuesta sale
  comprimida (`Content-Encoding: gzip`, `Vary: Accept-Encoding`; 6.000 agendas ≈ 130 KB). Debajo de eso, o sin gzip,
  sale como siempre. Los límites que quedan están en §14.5.

#### 7.4.2 El cruce agenda ↔ registro (`_registro`)

`indexarRegistros(regs)` arma dos mapas: `email → [registros]` y `tel8 → [registros]`. Para una agenda:
candidatos = registros con el mismo `Email` (minúsculas) ∪ registros con el mismo `tel8(WhatsApp)`. Si hay varios, se
elige el **más reciente con `creado <= Timestamp` de la agenda**; si ninguno es anterior, el más reciente de todos.
`_registro = cruceDe(reg) = {w, utm (las 5 claves, '' por defecto), respuestas, calificado, creado}`. Sin candidatos → `null`.
Nada de datos personales en `_registro` (el nombre sale de la fila).

#### 7.4.3 Personas del pipeline (`personas(agendas)`, P3; la usan P4 y P6)

Una persona = el conjunto de agendas unidas por union-find sobre `Email` (no vacío) y `tel8(WhatsApp)` (no vacío).
Una agenda sin email ni teléfono se une por `norm(Nombre)` (dos agendas sin contacto con el mismo nombre son la misma
persona; sin nombre, por su id).

`Persona = { clave, filas: Agenda[] (más reciente primero por 'Fecha call' y 'Hora'), emails: Set, tels: Set (tel8),
presento: boolean (alguna Presentada o Cerrada), compro: boolean (alguna Cerrada), cash: Σ monto(Monto) de sus Cerradas }`.
`clave` = el email más chico (orden de texto), si no el tel8 más chico, si no `norm(Nombre)`, si no el id. La lista
sale ordenada por la agenda más reciente de cada persona.

#### 7.4.4 `POST /api/panel {row, field, value}` (T) — `agendas.acciones.__editar`

Request `{"row":"ag_lq3k9x2ab3cd","field":"Estado","value":"Presentada"}`. Respuesta `{ok:true}` (el frontend no la lee:
`agSet` es optimista y revierte si hay error). Llegan N pedidos seguidos (uno por campo) desde "Registrar".

| `field` permitido | Validación / normalización |
|---|---|
| `Estado` | ∈ `ESTADOS` (si no: `400 {error:'Estado inválido'}`). Al pasar a `Cerrada` con `Fecha cierre` vacía → `Fecha cierre = hoyLocal`. |
| `Monto` | `monto(value)` (`'1.500'`, `'USD 1500'`, `'1500,5'` → número); vacío → `''`; no numérico → `400 {error:'El monto tiene que ser un número'}` |
| `Closer`, `Setter`, `Programa`, `Origen` (MAYÚSCULAS), `Evento`, `Gatillo`, `Notas`, `Nombre`, `Instagram`, `Negocio`, `Facturacion`, `Objetivo`, `Traba`, `Urgencia`, `Decisor` | `texto(value, 2000)` |
| `Email` | `email()` |
| `WhatsApp` | `normalizarLibre(value, negocio.pais)` o el texto tal cual |
| `Capital` | ∈ las claves de `capitalTramos` o `''` (si no: `400 {error:'Elegí un capital de la lista: >3K, 2-3K, 1-2K, <1K'}`, con los tramos del negocio) |
| `Fecha call`, `Fecha cierre` | `esFecha` o `''` (solo `Fecha cierre`); si no: `400 {error:'La fecha tiene que ser AAAA-MM-DD'}` / `'La fecha de cierre tiene que ser AAAA-MM-DD'` |
| `Hora` | `esHora` (si no: `400 {error:'La hora tiene que ser HH:MM'}`) |
| otro | `400 {error:'Ese campo no se puede editar'}` |

Orden de los chequeos: `field` (400), `value` que no es string, number, boolean ni `null` (`400 {error:'Pedido
inválido'}`), `row` (inexistente o que no pasa `idSeguro` → `404 {error:'No encontré esa agenda'}`), reglas del
closer (§5.5: los dos 403) y la validación de la tabla. Si un closer pone `Closer`, tiene que ser su propio nombre
(por `norm`) o `''`, y se guarda escrito como `yo.closer`.

**Guardado = `fusionarSi('agendas', row, cambios, si)`** (§6.2), nunca `fusionar`: así una edición sobre una agenda
borrada en el medio no la recrea, y dos closers que toman la misma agenda a la vez no reciben 200 los dos.

- `cambios = {[field]: valor}`; con `Estado: 'Cerrada'` y `Fecha cierre` vacía, además `Fecha cierre = hoyLocal`.
- `si` (la condición, con los valores **tal cual se leyeron**):
  - closer: `{Closer: ['', <Closer leído>, yo.closer]}` (`yo.closer` está en la lista para que los pedidos en paralelo
    del mismo closer —uno por campo desde "Registrar"— no se den 409 entre sí);
  - relleno de `Fecha cierre`: `{'Fecha cierre': ['', <leída>]}` (una fecha puesta a mano en el medio no se pisa);
  - equipo y cliente sin relleno: sin `si` (solo "si todavía existe").
- Si `fusionarSi` da `null`, se vuelve a leer la agenda:
  - ya no está → `404 {error:'No encontré esa agenda'}`;
  - es un closer y ya no es suya ni está sin closer → `409 {error:'Otro closer la tomó recién: recargá la pantalla'}`
    (con cualquier campo, no solo `Closer`);
  - si no, se decide de nuevo con lo leído y se reintenta, hasta 3 veces; después
    `409 {error:'La agenda cambió mientras guardabas: probá de nuevo'}`.

#### 7.4.5 `POST /api/panel {action:'add', ...}` (T) — alta manual e importación

Request (los vacíos no vienen; el import manda hasta 100 en serie):

```json
{ "action": "add", "Nombre": "Juan Pérez", "Fecha call": "2026-10-28", "Hora": "18:30", "WhatsApp": "+57 300 555 1234",
  "Email": "juan@example.com", "Capital": "1-2K", "Origen": "MASTERCLASS", "Closer": "Laura Gómez", "Setter": "",
  "Instagram": "juanp", "Estado": "Pendiente", "Timestamp": "2026-10-27 14:05" }
```

- Obligatorios: `Nombre` y `Fecha call` válida (`400 {error:'Falta el nombre'}` / `400 {error:'Falta la fecha de la llamada'}`).
- Se aceptan solo los campos de la tabla de 7.4.4 (más `Estado`, por defecto `Pendiente`); un valor que no es string,
  number, boolean ni `null` se ignora y los que quedan vacíos no se guardan. `Timestamp` del cliente
  **se ignora** (viene en UTC sin `T`): se guarda `new Date().toISOString()`. `_fuente = 'manual'`, `CalendlyID = ''`.
- **En `add` solo `Nombre` y `Fecha call` dan 400** (R-05). El import manda las celdas de un CSV tal cual (agendas.js:1526-1531:
  solo normaliza `Fecha call` y `Hora`) y corta en el primer error ("Se cortó en la N"), así que el resto se normaliza
  sin rechazar: `Capital` que no es un tramo → `capitalTramo(texto, capitalTramos)` (`'1500'` → `'1-2K'`, sin número →
  `''`); `Hora` que no cumple `esHora` → `''`; `Fecha cierre` inválida → `''`; `Monto` no numérico → `''`; `Email` →
  `email()` aunque no tenga `@`; `WhatsApp` → `normalizarLibre` o el texto tal cual; `Origen` en MAYÚSCULAS; `Estado`
  fuera de `ESTADOS` → `Pendiente`; campos desconocidos → se descartan. La validación
  estricta de 7.4.4 es solo para la edición campo por campo.
- `Estado: 'Cerrada'` sin `Fecha cierre` → `Fecha cierre = hoyLocal`.
- **`Closer`:** el alta acepta cualquier closer, también cuando la hace un closer (§5.4: `add` es T; §5.5 limita la
  edición, no el alta). Si un closer pone su propio nombre escrito de otra forma, se guarda como `yo.closer`.
- **Dedupe:** si ya hay una agenda con la misma `Fecha call`, (mismo email o mismo `tel8`) **y la misma `Hora`** (o
  alguna de las dos sin hora), se completan sus campos vacíos con lo nuevo y se responde
  `{ok:true, row:'<id>', duplicada:true}`. Con otra hora es otra llamada (re-agendó el mismo día) y va como alta.
  - Se escribe con `fusionarSi` y la condición `{campo: ['', <valor leído>]}` para cada campo que se completa: lo que
    alguien llenó en el medio no se pisa. Si no entra, se vuelve a leer y se recalcula qué falta, hasta 3 veces
    (después, `409 {error:'La agenda cambió mientras guardabas: probá de nuevo'}`). Si la borraron en el medio, va como
    alta nueva completa.
  - Si quien carga es un closer, en la duplicada solo completa campos de su lista (`Estado`, `Monto`, `Gatillo`,
    `Notas`, `Programa`, `Closer`), solo si la agenda es suya o sin closer (si no, responde `duplicada:true` sin tocar
    nada), `Closer` solo con su propio nombre, y con la misma condición de `Closer` que en 7.4.4.
- **Alta:** `{ok:true, row:'<id nuevo>'}`. Con email o teléfono, el id es **fijo**:
  `'ag_' + sha256('alta' | Fecha call | Hora | 'e:' + email ó 't:' + tel8)` (20 hex), así dos altas iguales a la vez
  (doble clic en Guardar) escriben la misma agenda en vez de dos (se escribe con `fusionar`, que crea). Si ese id ya
  existe y es otra agenda (le cambiaron el contacto o la hora después), va con un id nuevo. Sin contacto,
  `nuevoId('ag_')`.

#### 7.4.6 `POST /api/panel {action:'adel', row}` (E/C)

Borra la agenda (`404 {error:'No encontré esa agenda'}` si no existe). → `{ok:true}`. Las evaluaciones que apuntaban a
ella quedan (se pegan por nombre+fecha). Si la agenda vino de un calendario (tiene `fuenteId`), antes se anota en
`ajustes/agendas-borradas` con `fusionar` (`{[fuenteId]: ahora}`): el sync no la vuelve a traer (§7.5.4).

### 7.5 `/api/agendas-sync` y la sincronización de calendarios (P3)

`netlify/functions/agendas-sync.mjs`: `config = { path: '/api/agendas-sync', method: ['GET','POST'] }`. Roles T.
Ojo: el frontend usa `fetch` crudo (un 401 no abre el gate) y **las dos formas de respuesta son distintas**.

#### 7.5.1 `GET` — estado de la última corrida

```json
{ "ok": true, "estado": { "cuando": "2026-10-27T14:05:00.000Z",
  "iclosed":  { "fuente": "iclosed",  "saltado": true },
  "calendly": { "fuente": "calendly", "saltado": false, "error": "", "guardadas": 3, "parcial": false } } }
```

Nunca corrió → `{ok:true, estado:null}`. `estado` = `ajustes/sync-agendas` sin `id`, `creado` ni `actualizado`.

#### 7.5.2 `POST` (cuerpo `{}`) — sincronizar ya

Corre `sincronizar({presupuestoMs: 20000})` y responde **sin** envoltorio `estado`:

```json
{ "ok": true, "cuando": "2026-10-27T14:05:00.000Z",
  "iclosed":  { "fuente": "iclosed",  "saltado": true },
  "calendly": { "fuente": "calendly", "saltado": false, "error": "", "guardadas": 3, "parcial": false } }
```

**Las dos fuentes van siempre**, cada una con `fuente` (`'iclosed'`/`'calendly'`): sin conectar → `{fuente, saltado:true}`;
con error → `{fuente, saltado:false, error:'<texto>', guardadas:n, parcial:false}`. El estado se guarda en
`ajustes/sync-agendas` (se reemplaza entero). Un error de una fuente no impide la otra ni hace fallar el request
(siempre 200). Los textos de error: el mensaje de la integración si es para la persona (`legible`, §6.11); si no,
`'<iClosed|Calendly> devolvió algo que no entiendo: probá de nuevo en unos minutos'`; si no se pudo leer la
integración, `'No pude leer la integración: probá de nuevo'`; si falló la escritura, `'No pude guardar las agendas:
probá de nuevo'`. Lo que la fuente alcanzó a traer antes de un error se guarda igual.

#### 7.5.3 `agendas-sync-cron.mjs`

`config = { schedule: '*/15 * * * *' }` (UTC). Corre `sincronizar({presupuestoMs: 25000})` (límite 30 s) y guarda el
estado. Responde `{ok:true, ...estado}`; si tira, lo loguea y responde `500 {ok:false, error:'La sincronización
falló: se reintenta en 15 minutos'}` (nadie lo lee: es para el log).

#### 7.5.4 Algoritmo de `sincronizar` (por fuente, dentro del presupuesto de tiempo)

Comunes:
- Las dos fuentes corren en paralelo, cada una con su integración (`conectada`, §6.9; si no, `saltado`). Calendly
  recibe en `vistos` los eventos ya procesados (todas sus agendas con el mismo `eventoActualizado`). `presupuestoMs`
  incluye la escritura: a las fuentes les queda el total menos una reserva de `min(5 s, presupuesto / 4)`. Pedido a la
  fuente: desde hace 30 días hasta dentro de 60.
- Upsert por `fuenteId`. Cada fuente decide contra una **foto** de `agendas` (indexada por `fuenteId`) y de
  `ajustes/agendas-borradas`, leídas justo antes de escribir; la escritura no pisa lo que se hizo a mano mientras tanto
  (ver "Escritura" abajo).
- **Campos que la fuente pisa siempre** (cuando trae algo: un valor vacío de la fuente no borra lo guardado):
  `Nombre`, `Email`, `Fecha call`, `Hora`, `Evento`, `Timestamp`, `CalendlyID`, `_fuente`, `fuenteId`. **Solo si están vacíos** (`SI_VACIO`): `WhatsApp`, `Instagram`, `Closer`, `Origen`, `Capital`,
  `Negocio`, `Facturacion`, `Objetivo`, `Traba`, `Urgencia`, `Decisor`. **Nunca:** `Estado` (salvo cancelación),
  `Monto`, `Gatillo`, `Notas`, `Setter`, `Programa`, `Fecha cierre`.
- `SI_VACIO` completa un campo solo si está vacío **y** la fuente trae un valor distinto del que trajo la vez anterior
  (`deFuente`, §4.3): lo que alguien vació a mano queda vacío. Agendas viejas sin `deFuente` = como antes.
- Agenda nueva: `Estado = 'Pendiente'` (o `'Cancelada'` si ya llega cancelada). Cancelada en la fuente:
  `Estado = 'Cancelada'` solo si el actual es `Pendiente`, `Confirmada` o `Re-agenda`, y **una sola vez**, en la
  transición (cuando `canceladaFuente` pasa de `false` a `true`): si el equipo la reabre, queda reabierta.
- `Fecha call` = `diaLocal(inicio, zona)`, `Hora` = `horaLocal(inicio, zona)` (zona del negocio, no UTC). Una reserva
  sin `fuenteId` o con un `inicio` que no se puede leer se descarta.
- Respuestas del form → campos por `opciones.mapeoForm`: la pregunta se normaliza con `norm` y, de las entradas que
  contienen alguna palabra, gana la de la palabra que **aparece primero** en la pregunta («cuanto factura tu negocio»
  → `Facturacion`, no `Negocio`); empate → el orden de la lista. Solo cuentan entradas cuyo `campo` es de `SI_VACIO`.
  Si dos preguntas caen en el mismo campo, queda la primera. `WhatsApp` del form pasa por `normalizarLibre`.
  `Capital` = `capitalTramo(respuesta, capitalTramos)`: toma el primer número del texto (`'1.000'` → 1000; `'2k'` o
  `'2 mil'` → 2000; `'2 a 3K'` = 2.000 a 3.000); si el texto dice "más de"/"mas de"/"+" suma 1; si dice "menos de"
  resta 1; el tramo de `desde` más alto con `n >= desde`. Un texto igual a la clave de un tramo (sin distinguir
  mayúsculas) queda tal cual. Sin número → `''`.
- `WhatsApp` = el de la reserva (con `normalizarLibre`, o tal cual) y si no trae, el del form; `Closer` = el de la
  reserva y si no, el del form. `Origen` = `utm_source` de la reserva (trim, espacios simples) en MAYÚSCULAS si viene;
  si no, la respuesta del form mapeada a `Origen`; si no, `''`. Las UTMs van a `utmAgenda` (con `normUtm`, solo si
  alguna trae algo).
- **Escritura** (para no pisar lo que se hizo a mano entre la foto y la escritura):
  - altas → `fusionarVarios`, con el id fijo `'ag_' + sha256(fuenteId)` (si el cron y el botón corren a la vez,
    escriben la misma agenda y no dos). Un `fuenteId` que está en `ajustes/agendas-borradas` no se vuelve a crear;
  - las que ya estaban y cuyo cambio no depende de lo escrito → `fusionarVariosSiExisten` (una borrada en el medio no
    vuelve);
  - las que traen la cancelación o algún campo `SI_VACIO` → `fusionarSi` con la condición
    `{Estado: ['', 'Pendiente', 'Confirmada', 'Re-agenda']}` y `{campo: ['', <valor de la foto>]}`. Si no se cumple,
    se vuelve a leer: si la borraron, se saltea; si no, se saca `Estado` si ya no es cancelable (p. ej. un `Cerrada`
    puesto a mano) y los `SI_VACIO` que alguien llenó, y se reintenta, hasta 3 veces; al final se escribe solo lo que
    pisa siempre y los internos. `canceladaFuente` se graba igual, así un `Cerrada` manual tampoco se cancela en las
    corridas siguientes. Corren de a 8 con `enParalelo`.
- `guardadas` = altas + filas que de verdad se escribieron con algún campo visible (las borradas en el medio y los
  cambios solo internos no cuentan). Si se acabó el presupuesto → `parcial: true` (el cron sigue). Una corrida sin
  novedades da `guardadas: 0` y no escribe ninguna agenda (lo guardado se compara con JSON de claves ordenadas: jsonb
  no guarda el orden); el estado en `ajustes/sync-agendas` se guarda siempre.

**Calendly** (Bearer `token`; organización = `integraciones/calendly.org`, o `GET /users/me`):
1. `GET https://api.calendly.com/scheduled_events?organization=<org>&min_start_time=<ahora−30d ISO>&max_start_time=<ahora+60d ISO>&count=100&sort=start_time:asc` (+ `page_token` de `pagination.next_page_token`). Sin filtro de `status` (vienen activos y cancelados).
2. Por evento: si todas sus agendas guardadas (agrupadas por `eventoUri`) tienen `eventoActualizado === event.updated_at`, se saltea. Si no,
   `GET <event.uri>/invitees?count=100` y por invitado:
   `fuenteId = 'calendly:' + uuid(invitado.uri)`, `CalendlyID = uuid`, `Nombre = name`, `Email = email`,
   `WhatsApp = text_reminder_number || respuesta de teléfono`, inicio = `event.start_time`, `Evento = event.name`,
   `Closer = event.event_memberships[0].user_name`, `Timestamp = invitado.created_at`,
   cancelado = `invitado.status === 'canceled' || event.status === 'canceled'`,
   respuestas = `questions_and_answers[] {question, answer}`, UTMs = `invitado.tracking {utm_source, utm_medium, utm_campaign, utm_content, utm_term}`.
   Se guardan `eventoActualizado = event.updated_at` y `eventoUri = event.uri`.
3. 429 → espera `retry-after` (máx. 3 s) una vez; si vuelve, corta con `parcial: true`.

**iClosed** (Bearer `key`; la página 0 es lo más nuevo; 50 por página):
1. `GET https://public.api.iclosed.io/v1/eventCalls?eventType=UPCOMING&limit=50&page=<p>` desde `p=0` hasta que una
   página traiga < 50, y lo mismo con `eventType=PAST` hasta 3 páginas (lo de más atrás ya está). Respuesta en
   `data.eventCalls[]`. Ante 429, una espera de 2 s y un reintento; si vuelve, `parcial: true`.
2. Por llamada: `fuenteId = 'iclosed:' + (id || callId)`, `CalendlyID = String(id)`, `Nombre = inviteeName`,
   `Email = inviteeEmail || contact.email`, `WhatsApp = phoneNumber || contact.phone`,
   inicio = `dateTimeUTC` (si falta, `dateTime` se toma como hora de pared de la zona del negocio),
   `Evento = event.name || eventType`, `Closer = [user.firstName, user.lastName].join(' ').trim()`,
   `Timestamp = createdAt`, UTMs de `utm[] {utmKey, utmValue}`, respuestas de `secondaryAnswers || questions`
   (`statement || question`, y el valor = primer `answer|value|label|text` no vacío, buscando en profundidad),
   cancelado = algún campo de estado (`status`, `callStatus`, `outcome`) que contenga `cancel` (sin confirmar en la
   documentación pública: §13).

### 7.6 `/api/crm` — el CRM de ventas (P4)

`netlify/functions/crm.mjs`: `config = { path: '/api/crm', method: ['GET','POST'] }`. El frontend usa su propio
`fetch`: **todo error tiene que llevar `error` string** (no alcanza `ok:false`). 401 → gate; 401/403 en el GET → el
`error` se usa como **título** de la pantalla de bloqueo (tiene que ser corto). El GET lo pueden pedir los tres roles,
así que en la práctica solo da 401 (`MENSAJE_401`).

`POST {accion, ...}`: una `accion` desconocida → `400 {error:'Acción desconocida'}`; después `requerir` (401) y el rol de
la acción: `borrar` y `metas` son E/C y un closer recibe `403 {error:'Solo el equipo puede borrar registros'}` /
`403 {error:'Solo el equipo puede cambiar los mínimos'}`. La respuesta es `{...resultado, ok:true}`. Los registros
salen siempre sin `actualizado` (con `creado`).

#### 7.6.1 `GET /api/crm?mes=YYYY-MM[&t=<ms>]` (T)

`mes` inválido o ausente → el mes actual. `t` se ignora.

```json
{
  "ok": true,
  "mes": "2026-10",
  "hoy": "2026-10",
  "yo": { "rol": "equipo", "closer": "" },
  "registros": [
    { "id": "v_lq3k9x2ab3cd", "tipo": "venta", "mes": "2026-10", "v": 3, "nombre": "Mariana Ruiz", "telefono": "+573001234567",
      "mail": "mariana.ruiz@example.com", "instagram": "", "fecha": "2026-10-23", "closer": "Laura Gómez",
      "presento": "Sí", "califica": "Sí", "situacion": "Adentro en Llamada", "dia1": 450, "seguimiento": 0,
      "notas": "", "fuente": "WEBINAR", "setter": "", "agenda": "ag_lq3k9x2ab3cd", "de": "",
      "programa": "Programa Insignia", "total": 900,
      "plan": { "programa": "Programa Insignia", "total": 900, "por": "Laura Gómez", "t": "2026-10-23T22:10:00.000Z",
                "mensaje": "…", "filas": [ { "concepto": "Adentro en Llamada", "monto": 450, "fecha": "2026-10-23", "pagado": true, "medio": "Transferencia" },
                                            { "concepto": "Cuota 2", "monto": 450, "fecha": "2026-11-23", "pagado": false, "medio": "" } ] },
      "historial": [ { "t": "2026-10-23T22:10:00.000Z", "q": "Laura Gómez", "c": "Cargó el cierre: Programa Insignia, USD 900" } ],
      "creado": "2026-10-23T21:55:00.000Z", "creadoPor": "Laura Gómez" },
    { "id": "c_lq3m1…", "tipo": "cuota", "mes": "2026-10", "v": 1, "nombre": "Pedro Sosa", "telefono": "+573005550000",
      "closer": "Diego Ruiz", "cuota": "Cuota 2", "fecha": "2026-10-30", "porCobrar": 300, "cobrado": 0,
      "situacion": "Por Cobrar", "notas": "", "de": "", "venta": "v_lq2…", "historial": [], "creado": "…", "creadoPor": "Diego Ruiz" }
  ],
  "listas": { "siNo": ["Sí","No"], "situacionVenta": ["…"], "situacionCuota": ["…"], "cuota": ["…"],
              "conceptoEntrada": ["…"], "conceptoDespues": ["…"] },
  "closers": ["Diego Ruiz", "Laura Gómez"],
  "programas": [ { "id": "pr_lq…", "nombre": "Programa Insignia", "precio": 900, "orden": 0 } ],
  "leaderboard": {
    "closers": [ { "closer": "Laura Gómez", "k": { "agendas": 9, "presentadas": 7, "calificadas": 6, "cierreGral": 0.4286,
                   "cierreEf": 0.5, "showUp": 0.7778, "aovD1": 600, "aovTrato": 850, "uSeg": 1, "uLlam": 2, "u2": 0,
                   "unidades": 3, "cashD1": 1800, "cashTrato": 2550, "cashSeg": 750, "cash": 2550 } } ],
    "equipo": { "...": "mismo objeto K sobre todas las ventas del mes" },
    "metas": { "objetivoMes": 15000 },
    "cuotas": 1200,
    "total": 3750
  },
  "metas": { "objetivoMes": 15000 }
}
```

- `hoy` es **el mes actual** `YYYY-MM` en la zona del negocio (no una fecha).
- `yo` obligatorio: `{rol, closer}` (`closer = ''` para equipo/cliente).
- `registros`: ventas y cuotas con `mes === mes` (closer: solo las suyas, por `norm`). Ordenados por `creado`.
- **Un nombre por closer:** `nombresCloser(personas closer, closers de los registros)` arma `norm(nombre) → nombre
  que se muestra` (el de la persona, primero las activas; si no hay persona, el primero que aparece) y cada registro
  sale con `closer` = `canonico(...)`. Así «laura gomez» cargado en una agenda y «Laura Gómez» de Equipo son la misma
  columna, el mismo chip y el mismo filtro (la pantalla compara el texto exacto). Lo mismo hacen `finanzasget`
  (§7.7.2) y, al guardar, el `closer` que escribe el equipo (§7.6.2).
- `listas` = `opciones().listas`. `closers` = nombres de personas activas con rol `closer` ∪ `closer` de los registros
  del mes, sin repetir por `norm`, con el nombre canónico, ordenados (`localeCompare` en `es`).
- `programas` = colección `programas` con nombre no vacío (`{id, nombre (trim), precio: n0, orden: number || 0}`),
  ordenada por `orden`.
- `metas` = `ajustes/metas` sin `id`, `creado` ni `actualizado` (`{}` si no hay).
- `leaderboard` **siempre presente** (vacío: `{closers:[], equipo:{}, metas:{}, cuotas:0, total:0}`): `closers[]` = un
  objeto por closer con ventas en el mes, `k = kpis(sus ventas)`, ordenado por `k.cash` desc (empate: por nombre); `equipo = kpis(todas)` (`{}` sin ventas)
  (las tasas salen del total, no del promedio); `cuotas` = Σ `cobrado` de las cuotas del mes; `total = equipo.cash + cuotas`;
  `metas` = `ajustes/metas`. El leaderboard se calcula sobre **todas** las ventas aunque pregunte un closer.

`kpis(ventas)` (`crm-core.mjs`; `SI(x) = norm(x) === 'si'`, `NO(x) = norm(x) === 'no'`; tasas 0–1 con 4 decimales o
`null` si el divisor es 0; promedios y plata con 2 decimales):

| Clave | Fórmula |
|---|---|
| `agendas` | # con `presento` Sí o No |
| `presentadas` | # con `presento` Sí |
| `calificadas` | # con `presento` Sí y `califica` Sí |
| `uLlam` · `uSeg` · `u2` | # `norm(situacion)` = `adentro en llamada` · `adentro en seguimiento` · `cerrado en 2 llamadas` |
| `unidades` | uLlam + uSeg + u2 |
| `fees` (interna) | # `norm(situacion) === 'fee'` |
| `cashD1` · `cashSeg` | Σ `dia1` · Σ `seguimiento` |
| `cash` | cashD1 + cashSeg |
| `cashTrato` | Σ (dia1 + seguimiento) de las ventas que son unidad |
| `cierreGral` | unidades / presentadas |
| `cierreEf` | unidades / calificadas |
| `showUp` | presentadas / agendas |
| `aovTrato` | cashTrato / unidades |
| `aovD1` | cashD1 / (unidades + fees) |

#### 7.6.2 `POST {accion:'guardar', registro, base}` (T)

```json
{ "accion": "guardar", "base": 3,
  "registro": { "tipo": "venta", "mes": "2026-10", "id": "v_lq3k9x2ab3cd", "presento": "Sí", "dia1": 450 } }
```

- Solo viajan los campos cambiados. Lista blanca (con su largo máximo): comunes `nombre` (200), `telefono` (60), `mail`
  (200), `instagram` (100), `fecha` (30), `closer` (100), `notas` (5000), `situacion` (100), `de` (100); venta
  `presento, califica, dia1, seguimiento, fuente` (100), `setter` (100), `agenda` (100); cuota `cuota` (100),
  `porCobrar, cobrado`. Lo demás se ignora (nunca se aceptan `plan, historial, v, creado, creadoPor, programa, total,
  venta`). Un texto que llega como objeto o array → `400 {error:'Revisá <el campo>'}` (p. ej. `'Revisá el nombre'`).
  Números con `monto()` → `number` (0 si vacío o sin dígitos), de 0 a `TECHO` (si no, `400 {error:'Los montos van con
  números de 0 para arriba'}`). `presento`/`califica` por `norm`: `'si'` → `'Sí'`, `'no'` → `'No'`, vacío → `''`;
  otra cosa → `400 {error:'«Se presentó» y «Calificaba» van con Sí o No'}`. `registro` que no es objeto →
  `400 {error:'Pedido inválido'}`.
- **Crear** (sin `id`): `tipo` (`400 {error:'Falta el tipo de registro (venta o cuota)'}`) y `mes` `YYYY-MM`
  (`400 {error:'Falta el mes del registro'}`); venta requiere `nombre` (`400 {error:'Falta el nombre'}`) y, si quien
  guarda no es closer, `closer` (`400 {error:'Elegí el closer'}`), que se guarda con el nombre canónico (§7.6.1).
  Arranca con todos los campos de su tipo vacíos (`''` o 0) más lo que vino, `v = 1`, `creadoPor = yo.nombre`, historial
  `[{t, q, c:'Creó el registro'}]`; `id = nuevoId('v_'|'c_')`. **Copias (`de`):** si ya existe un registro del mismo
  `tipo` y `mes` con ese `de`, se devuelve ese (sin crear otro); si no, el id es fijo (`idFijo(prefijo, 'copia', tipo,
  mes, de)`, §4.3) y se reserva creando el documento vacío y reemplazándolo con `v` 0 → 1: dos altas a la vez escriben
  una sola y la otra recibe esa.
- **Editar** (con `id`): `404 {error:'No encontré ese registro: recargá la pantalla'}` si no existe, si el `id` no pasa
  `idSeguro` o si el `tipo` del pedido no es el guardado. Si `base !== undefined` (también `null`) y
  `Number(base) !== (doc.v || 0)` → **`409 {error:'Alguien lo cambió mientras lo editabas: te muestro lo último',
  registro: <doc actual>}`** (un `base` que no es número, string ni `null` → 400). Si nada cambió de verdad (los
  números se comparan con `n0`), responde el registro sin tocarlo. Si no, aplica, `v + 1`, agrega al historial
  `{t, q: yo.nombre, c: {campo: [antes, después], ...}}` (solo los campos que cambiaron, cada valor recortado a 200
  caracteres) y guarda con `reemplazarSiVersion` (si otro escribió en el medio → el mismo 409; si lo borraron → 404).
  `mes` nunca se mueve.
- Closer: §5.5 (`403 {error:'Ese registro es de otro closer'}` / `'Ese mes ya está liquidado'`). Además, lo que
  engancha tiene que ser suyo: una `agenda` de otro closer (la que no tiene closer sí puede) →
  `403 {error:'Esa agenda es de otro closer'}`, y una copia (`de`) de un registro de otro closer →
  `403 {error:'Ese registro es de otro closer'}`. Si no, `crmsync` o «traer la cuota» moverían lo de otro.
- Respuesta `{ok:true, registro: <doc completo>}`.

#### 7.6.3 `POST {accion:'borrar', id, tipo, mes}` (E/C)

Copia a `crm-borrados/<id>-<ms>` `{original, por: yo.nombre, t}` y borra. Las cuotas generadas por un cierre de esa
venta **no** se borran. → `{ok:true}`. `404 {error:'No encontré ese registro: recargá la pantalla'}` si no existe.
Solo se usa el `id`.

#### 7.6.4 `POST {accion:'cierre', id, mes, plan}` (T) — `armarCierre`

```json
{ "accion": "cierre", "id": "v_lq3k9x2ab3cd", "mes": "2026-10",
  "plan": { "programa": "Programa Insignia", "total": 900,
            "filas": [ { "concepto": "Adentro en Llamada", "monto": 450, "fecha": "2026-10-23", "pagado": true,  "medio": "Transferencia" },
                       { "concepto": "Cuota 2",            "monto": 450, "fecha": "2026-11-23", "pagado": false, "medio": "" } ] } }
```

Validación: la venta existe y es `tipo:'venta'` (`404 {error:'No encontré esa venta: recargá la pantalla'}`) y quien
llama la puede editar (§5.5); `plan.programa` no vacío (texto hasta 200; `400 {error:'Elegí el programa'}`);
`0 < total <= TECHO` (`400 {error:'Poné el precio total'}`); 1 a 8 filas (`400 {error:'El plan tiene que tener de 1 a 8
pagos'}`) con `monto` numérico de 0 a `TECHO` (`400 {error:'Revisá el monto de cada pago'}`) y `fecha` válida
(`400 {error:'Revisá la fecha de cada pago'}`: el usuario puede vaciar el campo, crm.js:537); la venta no tiene `plan`
(`409 {error:'Esta venta ya tiene su cierre cargado'}`). La suma distinta del total **no** se rechaza: se guarda
`plan.diferencia = total − Σ montos` (solo si no es 0). El frontend muestra el texto como
`'No pude cargar el cierre: ' + error` (R-06).

Cada fila queda `{concepto, monto (2 decimales), fecha, pagado, medio}`: la fila 0 siempre `pagado: true`; `concepto`
hasta 80 (vacío → `'Adentro en Llamada'` en la 0 y `'Cuota <n>'` en las otras); `medio` hasta 60 y solo en las pagadas.

Efectos:
1. `situacion` de la venta = `concepto` de la fila 0 si es `Adentro en Llamada`, `Adentro en Seguimiento` o `Fee` (por `norm`); si no, `Adentro en Llamada`.
2. Plata: la fila 0 (siempre pagada) suma a `dia1`, salvo que su concepto sea `Adentro en Seguimiento` (suma a
   `seguimiento`). Las filas siguientes con `pagado:true` suman a `seguimiento`. (Se **suman** a lo que ya tuviera.)
3. Cada fila con `pagado:false` crea una cuota en **el mes en que vence** (`mes = fila.fecha.slice(0,7)`):
   `{tipo:'cuota', mes, nombre, telefono, mail, instagram, closer (de la venta), cuota: fila.concepto, fecha: fila.fecha,
   porCobrar: fila.monto, cobrado: 0, situacion: 'Por Cobrar', notas: '', de: '', venta: <id de la venta>, v: 1,
   historial: [{t, q, c:'Salió del cierre de <nombre>: <programa>'}], creadoPor}`, con id fijo
   `idFijo('c_', 'cierre', ventaId, i)` (§4.3).
4. `venta.plan = {programa, total, filas, por: yo.nombre, t: ahora, mensaje, diferencia?}`; además `venta.programa` y `venta.total`.
5. `mensaje` (texto plano para pegar en el grupo del equipo; montos con `Intl.NumberFormat(negocio.locale)`, hasta 2
   decimales):
   ```
   ✅ Nueva venta: <nombre o 'sin nombre'>
   Programa: <programa> · Total <moneda> <total>
   Closer: <closer o '—'>[ · Setter: <setter>]
   Pagó hoy: <moneda> <monto fila 0>[ (<medio>)]
   [Otros pagos ya hechos: <moneda> <monto> el <dd/mm>[ (<medio>)][ · …]]
   Cuotas a cobrar:
   · <concepto>: <moneda> <monto> el <dd/mm>
   ```
   Sin cuotas, la línea queda `Cuotas a cobrar: ninguna`.
6. Historial `c: 'Cargó el cierre: <programa>, <moneda> <total>'`, `v + 1`.

Escritura: primero la venta, con `reemplazarSiVersion` sobre la `v` leída (dos cierres a la vez → pasa uno; al otro, si
la venta ya tiene plan, `409 'Esta venta ya tiene su cierre cargado'`; si cambió otra cosa, el 409 de 7.6.2 con
`registro`; si la borraron, 404). Después las cuotas, con `fusionarVarios`. Si escribir las cuotas falla, la venta vuelve
a como estaba (`reemplazarSiVersion` con la versión recién escrita) y el error sale como 500: el "probá de nuevo" anda, y
como las cuotas tienen id fijo, una que haya llegado a escribirse se pisa en vez de duplicarse.

Respuesta `{ok:true, registro: <venta actualizada>}`.

#### 7.6.5 `POST {accion:'metas', metas}` (E/C)

Llegan solo las claves no vacías. **Reemplaza** `ajustes/metas` entero (para poder borrar un mínimo). Claves
aceptadas: `agendas, presentadas, calificadas, unidades, cierreGral, cierreEf, showUp, aovTrato, cash, cuotas,
total, objetivoMes` (números o texto con `monto()`, ≥ 0: si no, `400 {error:'Los mínimos van con números de 0 para
arriba'}`; las tasas `cierreGral`, `cierreEf` y `showUp` hasta 1: si no, `400 {error:'Las tasas van de 0 a 1 (0,3 es
30 %)'}`). Las demás claves y las vacías se ignoran; `metas` que no es objeto → `400 {error:'Pedido inválido'}`.
→ `{ok:true}`.

### 7.7 Acciones de finanzas en `/api/panel` — `lib/panel/finanzas.mjs` (P4)

#### 7.7.1 `{action:'crmsync', previo:boolean}` (T)

Concilia el pipeline con el CRM. Ventas a mirar: las del mes actual, y las del mes anterior si `previo` es `true` o
si el día del mes es ≤ 10. Por cada venta, la fila del pipeline es: la de `id === venta.agenda`; si no, la única con
`norm(Nombre) === norm(nombre)` y la misma `Fecha call` que `venta.fecha`; si no, la única con mismo `tel8`. Si no hay
una sola, se saltea. Por nombre o por teléfono solo cuentan las filas del closer de la venta o sin closer (§5.5: una
venta de un closer no mueve la agenda de otro); el vínculo explícito (`agenda`) no tiene ese filtro. Cambios:

| Condición (en este orden) | Fila |
|---|---|
| venta es unidad (`adentro en llamada/seguimiento`, `cerrado en 2 llamadas`) | `Estado = 'Cerrada'`, `Monto` = cash de toda la familia de la venta (la original y sus copias en otros meses, siguiendo `de`; 2 decimales), `Programa = plan.programa` de la venta o, si no tiene, el de otra de la familia, si hay; `Fecha cierre` = `venta.fecha` (o hoy si no es una fecha válida) si está vacía |
| `presento` Sí | `Estado = 'Presentada'` (si no estaba `Cerrada`) |
| `presento` No | `Estado = 'No-show'` (si no estaba `Cerrada` ni `Presentada`) |

Solo se escribe lo que cambia, y **con condición** (las agendas se leen una vez y se pueden tocar a mano antes de
escribir):

- todo va solo sobre agendas que siguen existiendo (`fusionarVariosSiExisten` / `fusionarSi`): una borrada en el
  medio no vuelve como fila sin nombre;
- `Presentada` y `No-show` se escriben con `fusionarSi` solo si el `Estado` sigue siendo el leído (un `Cerrada` puesto
  a mano en el medio no queda pisado);
- `Fecha cierre` solo si sigue vacía (`{'Fecha cierre': ['', <leída>]}`);
- el `Cerrada` de una venta que es unidad manda y va directo.

Lo que no entró lo vuelve a mirar la próxima conciliación. → `{ok:true, actualizados: n}`, con `n` = filas que **de
verdad** se escribieron (no cuenta las borradas ni las que saltó la condición).

#### 7.7.2 `{action:'finanzasget'}` (E/C; closer 403)

```json
{
  "ok": true,
  "meses": {
    "2026-10": { "mes": "2026-10",
      "ventas": [ { "id": "v_…", "nombre": "Mariana Ruiz", "closer": "Laura Gómez", "setter": "", "situacion": "Adentro en Llamada",
                    "programa": "Programa Insignia", "total": 900, "fuente": "WEBINAR", "fecha": "2026-10-23", "dia1": 450, "seguimiento": 0 } ],
      "cuotas": [ { "id": "c_…", "v": 1, "cuota": "Cuota 2", "nombre": "Pedro Sosa", "telefono": "+573005550000", "closer": "Diego Ruiz",
                    "situacion": "Por Cobrar", "fecha": "2026-10-30", "cobrado": 0, "porCobrar": 300, "de": "", "notas": "" } ] }
  },
  "metas": { "objetivoMes": 15000 },
  "comisiones": { "def": 10, "pct": { "Laura Gómez": 12 } },
  "liq": { "2026-09": { "laura gomez": { "monto": 480, "fecha": "2026-10-05", "pct": 12 } } }
}
```

- `meses`: **todos** los meses con registros (máximo los últimos 36), cada valor repite `mes`. Los closers salen con el
  nombre canónico, como en `/api/crm` (§7.6.1): la pantalla agrupa «Ventas por closer» por el texto exacto.
- Ventas: `programa`/`total` arriba (del plan); sin plan, `programa = ''` y `total` = `dia1 + seguimiento` si es
  unidad, si no `0`. Cuotas: `v` y `de` **obligatorios** (`de: ''` si no hay).
- `metas` = `ajustes/metas` (sin `id`, `creado` ni `actualizado`) o `{}`. `comisiones` = `ajustes/comisiones` o
  `{def: 10, pct: {}}`. `liq` = `ajustes/liq` o `{}`, solo con las claves que son un mes y tienen algo (la `v` del
  documento no sale).

#### 7.7.3 `{action:'liqpago', mes, closer, pago:{monto, fecha}|null}` (E/C)

`key = norm(closer)`. `pago: null` → borra `liq[mes][key]`. Si no: `{monto (number ≥ 0, 2 decimales), fecha (válida,
defecto hoy), pct, por: yo.nombre, t}` con **`pct = existente.pct ?? comisiones.pct[closer por norm] ?? comisiones.def
?? 10`** (el cliente nunca manda `pct`). → `{ok:true, liq: <el mapa de ese mes>}` (`{}` si quedó vacío).

Errores: `mes` que no es `YYYY-MM` → `400 {error:'Falta el mes de la liquidación'}`; `closer` vacío (texto hasta 100) →
`400 {error:'Falta el closer'}`; sin la clave `pago` o `pago` que no es objeto ni `null` → `400 {error:'Pedido
inválido'}`; `monto` que no es número de 0 a `TECHO` → `400 {error:'Revisá el monto pagado'}`; `fecha` inválida →
`400 {error:'Revisá la fecha del pago'}`. `ajustes/liq` es un solo documento con todos los meses: se escribe con
`reemplazarSiVersion` sobre su `v` y se reintenta hasta 5 veces si otro pago entró en el medio (dos pagos a la vez de
closers distintos no se pisan); si no entra, `409 {error:'Se estaban guardando otros pagos a la vez: probá de nuevo'}`.

#### 7.7.4 `{action:'comisiones', comisiones:{def, pct:{nombre: número}}}` (E/C)

Valida 0 ≤ valor ≤ 100 (número, o texto con `monto()`; si no, `400 {error:'El porcentaje va de 0 a 100'}`); `def`
vacío → 10. En `pct`, los nombres van con trim (hasta 100), los vacíos o con valor vacío se saltean y el mismo closer
escrito de dos formas (por `norm`) queda una sola vez (el último). `comisiones` que no es objeto → `400 {error:'Pedido
inválido'}`. **Reemplaza** el objeto. → `{ok:true, comisiones: <guardado>}`.

### 7.8 `/api/db` — colecciones genéricas (P7)

`netlify/functions/db.mjs`: `config = { path: '/api/db', method: ['GET','POST','DELETE'] }`. El cliente (`db.js`) no
abre el gate en 401: el `error` tiene que ser legible (`MENSAJE_401`). Un `200` con `error` truthy se toma como error.

| Pedido | Respuesta |
|---|---|
| `GET /api/db?col=<col>` | `{ok:true, docs:[doc, ...]}` (por `creado` asc; `[]` si no hay). Si la respuesta pasa los 5,5 MB → `400 {error:'Esta colección es demasiado grande para traerla entera: borrá documentos que no uses'}` |
| `POST {col, doc}` | `{ok:true, doc: <doc completo después del merge>}` |
| `POST {col, docs:[...]}` | `{ok:true, docs:[<docs completos>]}` (máx. 200, si no `400 {error:'Demasiados documentos'}`) |
| `DELETE /api/db?col=<col>&id=<id>` | `{ok:true}` (aunque no existiera) |

Primero `requerir` (sin sesión, 401 antes de mirar nada); después la colección y el rol. El cuerpo del `POST` puede
tener hasta 1 MB.

Semántica de escritura (la exigen ads.js, agendas.js, inicio.js y kpis.js):
- `doc` sin `id` → crear con `nuevoId(prefijo)` (prefijos: `programas` → `pr_`, el resto → letra inicial de la colección + `_`).
- `doc` con `id` → **upsert con merge superficial** (`fusionar`): crea si no existe con ese id; las claves que vienen
  pisan (también con `null`); las que no vienen se conservan. Siempre devuelve el doc completo (p. ej.
  `anun-config/atribucion` con `tc` **y** `origenes` aunque se haya mandado uno solo). En `docs`, los ids repetidos se
  combinan antes (el último pisa).
- Se descartan del cuerpo `id` (se usa como clave), `creado` y `actualizado`. Un `doc` que no es objeto →
  `400 {error:'Pedido inválido'}`.
- **Tamaños:** cada doc, medido **después** del merge, hasta 64 KB, y la colección entera hasta 5 MB, para que siga
  entrando en un `GET` (`400 {error:'El documento es demasiado grande (máximo 64 KB)'}` / `400 {error:'Esta colección
  ya ocupa demasiado (máximo 5 MB): borrá lo que no uses'}`). Lo que ya se pasó se puede achicar: solo se rechaza lo
  que crece.
- **Todo o nada:** se valida todo el pedido (reglas de abajo, nombres y tamaños) contra lo guardado antes de escribir
  nada.
- `col` tiene que cumplir `/^[a-z0-9][a-z0-9-]{0,40}$/` (si no, `400 {error:'Colección inválida'}`) y no ser
  reservada (`403 {error:'Esa colección no se puede tocar desde acá'}`): `personas, webinars, ajustes, registros,
  agendas, crm, crm-borrados, integraciones, icp-ia, cache, limites, cola`. `id` con `idSeguro` (un entero se acepta y
  pasa a texto; si no, `400 {error:'Id inválido'}`).
- Roles: §5.4 (`ag-evaluaciones` y `ag-config` se leen con cualquier rol; todo lo demás, E/C, con
  `403 {error:'No tenés acceso a esto'}`).

Normalización por colección (además de lo genérico):

| Colección | Regla |
|---|---|
| `programas` | `nombre` texto con trim, hasta 120, obligatorio en un alta o si viene (`400 {error:'Falta el nombre del programa'}`); `precio = monto() ?? 0` (booleano, objeto o número no finito → `400 {error:'El precio tiene que ser un número'}`; negativo → `400 {error:'El precio tiene que ser 0 o más'}`); `orden` número redondeado (0 si no se entiende). Nombre repetido por `norm` → `409 {error:'Ya hay un programa con ese nombre'}`. Con `docs` (crm.js:656 guarda la lista entera de una vez, después de borrar los quitados) la unicidad se mide sobre el **resultado**: los docs del pedido más los guardados que el pedido no toca; renombrar A→B y B→A en el mismo pedido es válido, y solo frena lo que el pedido nombra o renombra (un duplicado viejo no bloquea otros cambios). Todo o nada: si uno falla, no se escribe ninguno (R-07). **Dos altas iguales a la vez** pasan las dos el chequeo: después de escribir, el nombre es del programa guardado primero (`creado`, `id`); las altas de este pedido que llegaron segundas se borran y responde el mismo 409 |
| `webinar-asistencia` | `asistentes` entero ≥ 0 (también como texto) o `null`/`''` → `null` (si no, `400 {error:'Los asistentes van como un número entero desde 0 (o vacío)'}`) |
| `ag-evaluaciones` | `score, lead, interes, urgencia` números 0–10 (también texto, con coma o punto) o `null`/`''` → `null` (si no, `400 {error:'Los puntajes van de 0 a 10'}`); `por` texto hasta 120, vacío → `yo.nombre` (en un alta o si viene) |
| `anun-audiencias` | `ratio` ∈ {0.01, 0.03, 0.05} (si no, `400 {error:'El tamaño del público va de 1 %, 3 % o 5 %'}`); `paises` array de códigos de 2 letras (en mayúsculas, sin repetidos), máx. 5 (`400 {error:'Elegí hasta 5 países'}` / `'Cada país va con su código de 2 letras (AR, MX…)'`) |

### 7.9 `/api/icp` y el ICP con IA (P6)

`netlify/functions/icp.mjs`: `config = { path: '/api/icp', method: ['GET'] }`. Roles E/C.

#### 7.9.1 `GET /api/icp?w=<webinarId|todos>`

`w` ausente → `todos`; un id inexistente se trata como alcance vacío (no 404). **La respuesta trae `w` idéntico al
pedido** (si no, las tres pantallas quedan cargando para siempre).

Definiciones (todas en el servidor):
- **Registros del alcance:** `registros` con `w === w` (si el webinar existe: los huérfanos de un webinar borrado no
  cuentan); con `todos`, todos los registros deduplicados por persona (mismo email o `tel8`, unidos con union-find),
  quedándose con el más reciente.
- **Persona ↔ registro:** cada persona del pipeline (§7.4.3) se queda con **un** registro del alcance, de los que
  comparten su email o `tel8`: el más reciente con `creado` ≤ el primer `Timestamp` de sus agendas (el que tenía al
  agendar por primera vez); si ninguno es anterior, el más reciente. Si dos personas se quedan con el mismo registro
  (uno trae el mail de una y el teléfono de otra), el registro prueba que son la misma y se unen en una sola. Así el
  cash no se cuenta dos veces, toda persona queda o en un registro o en `sinRegistro` y un registro tiene a lo sumo una
  persona. `agendaron` = el registro tiene persona; `presentaron` = esa persona `presento`; `compraron` = `compro`;
  `cash` = `persona.cash`. En todo grupo vale `n ≥ agendaron ≥ presentaron ≥ compraron`.
- Los campos de agenda de una persona (`camposAgenda`, `Objetivo`, `Traba`) son el valor de su agenda más reciente que
  lo tenga.
- UTMs normalizadas con `normUtm`; vacío = `''` en grupos, combos y `reg.utm` (nunca `null`).

```json
{
  "ok": true,
  "w": "w20261017a1b2",
  "utm": {
    "totales": { "n": 612, "calificados": 141, "respondieron": 370, "agendaron": 31, "presentaron": 22, "compraron": 7, "cash": 6300 },
    "dims": {
      "utm_source":   [ { "k": "fb", "n": 401, "calificados": 98, "agendaron": 21, "presentaron": 15, "compraron": 5, "cash": 4500 },
                        { "k": "",   "n": 40,  "calificados": 6,  "agendaron": 1,  "presentaron": 1,  "compraron": 0, "cash": 0 } ],
      "utm_campaign": [ { "k": "webinar-octubre", "ctx": "fb", "n": 380, "calificados": 90, "agendaron": 20, "presentaron": 14, "compraron": 5, "cash": 4500 } ],
      "utm_content":  [ { "k": "anuncio-2", "ctx": "webinar-octubre", "n": 140, "calificados": 41, "agendaron": 9, "presentaron": 7, "compraron": 3, "cash": 2700 } ]
    },
    "combos": [ { "source": "fb", "medium": "paid", "campaign": "webinar-octubre", "content": "anuncio-2",
                  "n": 140, "agendaron": 9, "compraron": 3, "cash": 2700 } ],
    "sinRegistro": { "agendas": 6, "ventas": 1, "cash": 900 }
  },
  "recorridos": [
    { "filas": ["ag_lq3m…", "ag_lq2k…"], "presento": true, "compro": true, "cash": 900,
      "reg": { "creado": "2026-10-12T14:03:00.000Z",
               "utm": { "utm_source": "fb", "utm_campaign": "webinar-octubre", "utm_content": "anuncio-2" },
               "calificado": true, "respuestas": { "cuanto-podes-invertir": "500 a 1.000" } } },
    { "filas": ["ag_lq4a…"], "presento": false, "compro": false, "cash": 0, "reg": null }
  ],
  "montos": { "ag_lq3m…": 900 },
  "icp": {
    "base": { "registros": { "n": 612, "respondieron": 370, "calificados": 141, "agendaron": 31, "presentaron": 22, "compraron": 7, "cash": 6300 },
              "pipeline":  { "n": 37, "compraron": 8, "cash": 7200 } },
    "landing": [
      { "id": "cuanto-podes-invertir", "texto": "¿Cuánto podés invertir en tu formación?",
        "opciones": [ { "opcion": "Más de 1.000", "n": 60, "agendaron": 9, "presentaron": 7, "compraron": 4, "cash": 3600, "califica": true,  "vieja": false },
                      { "opcion": "Lo que haga falta", "n": 3, "agendaron": 0, "presentaron": 0, "compraron": 0, "cash": 0, "califica": false, "vieja": true } ],
        "respondieron": { "n": 370, "agendaron": 25, "presentaron": 18, "compraron": 7, "cash": 6300 },
        "sinRespuesta": { "n": 242, "agendaron": 6, "presentaron": 4, "compraron": 0, "cash": 0 } }
    ],
    "agenda": [
      { "campo": "Capital", "etiqueta": "Capital",
        "opciones": [ { "respuesta": "1-2K", "n": 12, "presentaron": 9, "compraron": 4, "cash": 3600 } ],
        "respondieron": { "n": 30, "presentaron": 21, "compraron": 8, "cash": 7200 } }
    ],
    "texto": { "Objetivo": 18, "Traba": 15 }
  },
  "ia": { "hayKey": true, "estado": "done", "pid": "lq3k9x2a4f7b1c", "error": "",
          "resultado": { "generado_at": "2026-10-26T16:13:00.000Z", "lectura": "…",
                         "perfiles": [ { "titulo": "Profesional con ingreso estable", "descripcion": "…",
                                         "rasgos": [ { "campo": "cuanto-podes-invertir", "valor": "Más de 1.000" }, { "campo": "Capital", "valor": "1-2K" } ],
                                         "n": 9, "compraron": 4, "cash": 3600 } ],
                         "deseos":  [ { "titulo": "Un segundo ingreso", "n": 7, "frases": ["…"] } ],
                         "dolores": [ { "titulo": "Falta de tiempo", "n": 6, "frases": ["…"] } ] } }
}
```

Reglas de cada bloque:

| Bloque | Regla |
|---|---|
| `utm.totales` | sobre los registros del alcance; `respondieron` = `respondio`; `calificados` = `calificado === true` |
| `utm.dims.<dim>` | las tres claves siempre (arrays); grupos por `reg.utm[dim]` (`''` incluido, dentro del array) ordenados por `n` desc (empate: por clave); `ctx`: en `utm_campaign` la `utm_source` más frecuente del grupo, en `utm_content` la `utm_campaign` más frecuente (empate: la menor); en `utm_source` no va |
| `utm.combos` | grupos por `(source, medium, campaign, content)` del registro (claves **sin** `utm_`, `''` si falta), ordenados por `n` desc, con `n, agendaron, compraron, cash` |
| `utm.sinRegistro` | personas del pipeline que no se quedaron con ningún registro del alcance: `agendas` = cantidad de **personas**, `ventas` = las que compraron, `cash` |
| `recorridos` | una por persona de **todo** el pipeline (ya unidas como arriba), la de agenda más reciente primero: `filas` = ids de sus agendas, la más reciente primero; `reg` = su registro del alcance (`creado`, `utm` con las tres claves, `calificado` `true`/`false`/`null` y `respuestas` solo con los valores que son texto; sin nombre, mail ni teléfono) o `null`; `presento`, `compro`, `cash` |
| `montos` | `{<id de agenda>: monto(Monto) ?? 0}` de las agendas `Cerrada` |
| `icp.base.registros` | igual a `utm.totales`; `icp.base.pipeline` = personas del pipeline (`n`), `compraron`, `cash` |
| `icp.landing` | preguntas de la landing del webinar (con `todos`: unión por `id` de todas; el texto y el orden los pone el webinar más nuevo que la tiene y las opciones se suman); opciones en el orden del form y al final las "viejas" (elegidas por alguien pero ya no están en el form, `vieja:true`, por `n` desc); `califica` = está en `calificadas` hoy; `respondieron`/`sinRespuesta` sobre los registros del alcance; los objetos **no** llevan `campo` |
| `icp.agenda` | por cada campo de `camposAgenda` (`Facturacion` con etiqueta `Facturación`): por persona del pipeline, el valor de su agenda más reciente que lo tenga; grupos por valor ordenados por `n` desc; campos sin ningún valor se omiten; los objetos **no** llevan `texto` |
| `icp.texto` | personas del pipeline con texto en `Objetivo` y en `Traba` |
| `ia` | siempre presente: `hayKey` = integración `ia` conectada; el resto de `icp-ia/<w>` (`{estado:'', pid:'', error:'', resultado:null}` si no hay; un `estado` que no es `working`, `done` ni `error` sale `''`). Si `estado === 'working'` y `desde` tiene más de 16 min → se devuelve (y se guarda con `fusionar`) `estado:'error', error:'Se cortó el cálculo: probá de nuevo.'`. `resultado` sale como `{generado_at, lectura, perfiles, deseos, dolores}` (temas sin título se descartan) |
| `ia.resultado.perfiles[].n/compraron/cash` | **recontados en cada GET** con `contarPerfiles`: universo = registros del alcance (con los campos de agenda de su persona) ∪ personas del pipeline sin registro; un rasgo de landing (`campo` = id de pregunta) se cumple si `respuestas[campo] === valor`; uno de agenda (`campo` ∈ camposAgenda) si el valor de la agenda más reciente `=== valor`; `n` = cumplen todos |

#### 7.9.2 `POST /.netlify/functions/icp-generar-background?w=<w>&pid=<pid>` (E/C)

Archivo `netlify/functions/icp-generar-background.mjs`, **sin `config.path`** (D11-D12). Sin cuerpo. Netlify responde
`202` vacío al instante (el frontend solo mira `r.ok`). La función **nunca tira** (Netlify reintentaría): todo va en
`try/catch` y los errores se escriben en el estado.

1. Solo `POST` (un `GET` llega con la cookie en una navegación desde otro sitio, por `SameSite=Lax`, y gastaría la
   clave: no hace nada). `requerir(req, ['equipo','cliente'])`; si falla, termina sin escribir. `pid`
   `/^[a-z0-9]{6,32}$/` y `w` = `'todos'` o un id seguro (`alcanceValido`); si no, termina.
2. `nro = incrementar('icp-ia', w, 'corridas')` (el orden de arranque de este cálculo, atómico) y
   `fusionar('icp-ia', w, {estado:'working', pid, desde: ahora, error:'', nro})` (conserva `resultado`).
3. Sin integración `ia` conectada → `error:'Falta la clave de Anthropic en Integraciones'`; un webinar que no existe →
   `error:'No encontré ese webinar: elegí otro y probá de nuevo'`; sin registros ni agendas en el alcance →
   `error:'Todavía no hay registros ni agendas para armar perfiles'`. En los tres casos termina ahí.
4. `datos = armarICP(w)` y `pedido = pedidoIA(datos)`, **solo con agregados**: `base`, `landing` (id, texto, opciones
   con conteos y `califica`; de las "viejas", solo las que tienen `n > 0` y no traen datos personales), `agenda`
   (hasta 40 opciones por campo, sin las que traen datos personales) y `textos` = hasta 300 textos libres de
   `Objetivo` y `Traba`, mitad y mitad (lo que uno no usa lo toma el otro), cada uno con `limpiarTexto` (300
   caracteres; mails, links y dominios, `@usuarios` y teléfonos de 7 dígitos o más —con espacios, guiones, paréntesis,
   puntos o barras en el medio— pasan a `[dato]`; un monto con puntos de miles o una fecha no son teléfono; un texto
   que queda solo `[dato]` no va). Nada de nombres.
5. `llm.generarPerfiles(pedido, clave, {modelo: integ.modelo})` (§8.6) → `{perfiles:[{titulo, descripcion,
   rasgos:[{campo, valor}]}], lectura, deseos:[{titulo, n, frases}], dolores:[...]}`. `validarIA(r, pedido)` recorta
   lo que se puede contar: rasgos cuyo `campo`/`valor` existen en el pedido (exacto o, si no, sin tildes ni
   mayúsculas, devueltos con la forma del pedido), uno por campo y hasta 6 por perfil; perfiles con título y al menos un
   rasgo, máximo 6; `deseos` y `dolores` (de los textos de `Objetivo` y `Traba`) hasta 6, con `n` entre 1 y la cantidad
   de textos enviados y hasta 3 `frases` que de verdad salen de esos textos; títulos hasta 80, `descripcion` hasta 400 y
   `lectura` hasta 1.500, pasados por `limpiarTexto`. Un error de la IA → `error` con su mensaje (hasta 200).
6. El estado final (`done` con `resultado:{...validado, generado_at: ahora}`, o `error`) se escribe con
   `reemplazarSiVersion` sobre la `v` del documento (se relee y reintenta hasta 6 veces), con su `pid` y su `nro`: cada
   cálculo deja su resultado aunque otro siga corriendo (así su pestaña lo ve), y solo no pisa un estado final de un
   cálculo que arrancó después (`nro` mayor). Si el documento se borró en el medio (se borró el webinar), no escribe.
   El `resultado` anterior queda si este termina en error. Un error inesperado → `error:'Algo falló armando los
   perfiles: probá de nuevo'`.

El frontend hace polling a `/api/icp` cada 6 s hasta `estado !== 'working'` y `pid` igual al suyo (tope 15 min).

### 7.10 `/api/meta-ads` (P5)

`netlify/functions/meta-ads.mjs`: `config = { path: '/api/meta-ads', method: ['GET'] }`. Roles E/C. Tres modos por
query. El frontend usa `fetch` crudo en los tres: el servidor siempre manda JSON.

Comunes:
- `desde`/`hasta` `YYYY-MM-DD`, `desde ≤ hasta`, rango ≤ 400 días (si no, `400 {error:'Rango de fechas inválido'}`).
  Si faltan: últimos 30 días hasta hoy (zona del negocio).
- **No conectado** (sin token o sin cuenta): `200 {ok:true, configurado:false, falta:[...]}` con `'token'` y/o
  `'cuenta'` (en los tres modos; no se cachea).
- **Error de Meta**: `detalle` = mensaje crudo de Meta (`error.message`, con su código, p. ej. `"(#17) User request
  limit reached"`), así el frontend detecta el límite con su regex:

  | Código de Meta | Respuesta |
  |---|---|
  | 4, 17, 32, 613, 80000–80014 | `429 {error:'Meta pidió esperar', detalle}` |
  | 190 o `OAuthException` | `502 {error:'El token de Meta no es válido o venció', detalle}` |
  | otro / red | `502 {error:'Meta no respondió', detalle}` |

  El `detalle` nunca lleva el token (se tapa aunque Meta lo repita en el mensaje).
- **Plazo:** toda la consulta a Meta de un pedido tiene **45 s** (la función sincrónica corta a los 60): cada pedido a
  la Graph API espera 15 s o lo que quede, lo que sea menos. Si no termina →
  `502 {error:'Meta no respondió', detalle:'Meta tardó demasiado: probá con un rango más corto'}` (si un pedido solo
  agota sus 15 s con plazo de sobra, el `detalle` es `'Meta tardó demasiado en responder'`).
- **`parcial: true`** aparece en la respuesta (en los tres modos) cuando alguna lista de Meta llegó al tope de 20
  páginas (§8.1) o cuando no se pudieron completar los metadatos de algún anuncio por id: los números o la lista de
  anuncios pueden quedar cortos. Si no pasó, la clave no viene.
- Caché del servidor en `cache/meta:<sha1(modo|cuenta|desde|hasta)>` por `META_CACHE_S` (300 s). `generado` = cuándo se consultó a Meta de verdad.
- Las fechas de Meta salen en la zona de la cuenta publicitaria; los registros, en la del negocio (§13).
- Todos los números son `number` (nunca string); `ctr` en **porcentaje**; `costoPorResultado` `null` si no hubo resultados.

#### 7.10.1 Modo por campaña: `?desde&hasta[&diario=1]`

```json
{
  "ok": true, "configurado": true, "generado": "2026-10-27T14:03:11.000Z",
  "rango": { "desde": "2026-10-01", "hasta": "2026-10-27" },
  "cuenta": {
    "nombre": "Academia Faro", "moneda": "USD",
    "campanas": [ { "id": "9202610001", "nombre": "Webinar Octubre · Registros", "gasto": 812.4, "impresiones": 98000,
                    "clics": 1710, "ctr": 1.74, "leads": 0, "leadsPixel": 401, "conversaciones": 0, "landings": 1320,
                    "compras": 0, "facturado": 0, "resultados": 401, "tipoResultado": "leads", "costoPorResultado": 2.03,
                    "registros": 380, "calificados": 90 } ],
    "porDia": [ { "fecha": "2026-10-01", "gasto": 30.1, "impresiones": 3600, "clics": 60 } ]
  },
  "landing": { "registros": 612, "calificados": 141, "respondieron": 370, "asignados": 470, "sinAsignar": 142,
               "cpl": 1.33, "cplCalificado": 5.76,
               "porDia": { "2026-10-01": { "registros": 12, "calificados": 3 } } }
}
```

- **`rango` siempre objeto** (sin él desaparecen las comparaciones). `cuenta.porDia` solo con `diario=1` (si no, `[]`), cada ítem con `fecha` string.
- `landing`: registros de **todos** los webinars con `dia` en el rango; `asignados` = los que `atribucion.asignar` pone
  en alguna campaña; `sinAsignar = registros − asignados`; `cpl = Σ gasto / registros` (y `cplCalificado`) solo si
  la moneda de la cuenta es la del negocio, si no `null`; `porDia` **objeto** por fecha.
- `campanas[].registros/calificados` = reparto de la atribución (siempre número, 0 si no hay).

Llamadas a Meta (§8.1): cuenta, insights por campaña, insights diarios de cuenta (si `diario=1`) y lista de anuncios
(id, nombre, campaña) para la atribución por `utm_content`.

#### 7.10.2 Modo anuncio por anuncio: `?anuncios=1&desde&hasta`

```json
{
  "ok": true, "configurado": true, "generado": "2026-10-27T14:05:00.000Z",
  "rango": { "desde": "2026-10-01", "hasta": "2026-10-27" },
  "cuenta": { "id": "act_<n>", "nombre": "Academia Faro", "moneda": "USD", "impresiones": 482000, "alcance": 150000, "frecuencia": 3.21 },
  "permisos": { "ads_read": true, "ads_management": false },
  "campanas": [ { "id": "9202610001", "nombre": "Webinar Octubre · Registros", "estado": "ACTIVE" } ],
  "anuncios": [
    { "id": "920261000102", "nombre": "anuncio-2", "estado": "ACTIVE", "creado": "2026-10-02T15:00:00+0000", "primerDia": "2026-10-03",
      "campana": { "id": "9202610001", "nombre": "Webinar Octubre · Registros", "objetivo": "OUTCOME_LEADS" },
      "conjunto": { "nombre": "Intereses amplios" }, "creativo": { "thumb": "https://scontent.xx.fbcdn.net/…" },
      "gasto": 210.5, "impresiones": 24100, "alcance": 9800, "frecuencia": 2.46, "clics": 452, "ctr": 1.88, "cpm": 8.73,
      "visitas": 360, "leads": 0, "conversaciones": 0, "facturado": 0, "resultados": 140, "tipoResultado": "leads",
      "costoPorResultado": 1.5, "registros": 140, "calificados": 41,
      "video": { "reproducciones": 15000, "p75": 2100, "thruplays": 3300 },
      "porDia": [ { "fecha": "2026-10-03", "gasto": 9.2, "impresiones": 1100, "clics": 21 } ] }
  ],
  "landing": { "campanas": { "9202610001": { "registros": 380, "calificados": 90 } } }
}
```

- **`permisos` siempre presente** (es la marca de "respuesta de anuncios" del frontend). **`campana` siempre objeto con `id`** en cada anuncio.
- `anuncios` = anuncios con impresiones (o gasto) en el rango **más** los creados dentro del rango sin entrega (con métricas en 0, `porDia: []`), excluyendo `DELETED`. Los metadatos (estado, creado, campaña, conjunto, miniatura) salen de `/ads`; los anuncios con entrega que `/ads` no trajo (borrados o más allá del tope) se completan por id (§8.1); si eso falla, quedan con lo que traen los insights y la respuesta lleva `parcial: true`.
- `campanas` = todas las campañas no borradas de la cuenta (máx. 500, archivadas incluidas), para vincular planes sin entrega.
- `alcance`/`frecuencia` de cuenta y de anuncio salen de consultas **sin** `time_increment` (no se suman días).
- `ctr = clics / impresiones × 100`; `cpm = gasto / impresiones × 1000`; `primerDia` = primer día con impresiones.
- `registros`/`calificados` del anuncio: número (0 si no hubo) porque la atribución siempre se calcula en este modo.
- `video` `null` si el anuncio no tiene métricas de video.

#### 7.10.3 Modo resumen: `?resumen=1&desde&hasta`

```json
{ "ok": true, "configurado": true, "gasto": 2310.75, "moneda": "USD",
  "dias": [ { "fecha": "2026-10-01", "gasto": 30.1 } ], "rango": { "desde": "2026-10-01", "hasta": "2026-10-27" } }
```

`gasto` top-level numérico (0 es válido). Lo leen Inicio, KPIs, Funnel y Finanzas.

#### 7.10.4 Resultados y acciones (mapeo de `actions` de Meta)

`v(tipo)` = `Number(actions.find(a => a.action_type === tipo)?.value || 0)`.

| Campo | Regla |
|---|---|
| `leads` | `v('onsite_conversion.lead_grouped')`; si es 0 y no hay `offsite_conversion.fb_pixel_lead`, `v('lead')` |
| `leadsPixel` | `v('offsite_conversion.fb_pixel_lead')` |
| `conversaciones` | `v('onsite_conversion.messaging_conversation_started_7d')` |
| `landings` (campaña) / `visitas` (anuncio) | `v('landing_page_view')` |
| `compras` | `max(v('purchase'), v('offsite_conversion.fb_pixel_purchase'))` |
| `facturado` | lo mismo sobre `action_values` |
| `tipoResultado` | `compras` si compras > 0; si no `leads` si max(leads, leadsPixel) > 0; si no `conversaciones` si > 0; si no, por objetivo: `OUTCOME_SALES`/`CONVERSIONS` → `compras`, `OUTCOME_LEADS`/`LEAD_GENERATION` → `leads`, `MESSAGES`/`OUTCOME_ENGAGEMENT` → `conversaciones`; si no `null` |
| `resultados` | la cantidad de ese tipo (para `leads`, `max(leads, leadsPixel)`); 0 si `null` |
| `costoPorResultado` | `resultados > 0 ? gasto / resultados : null` |
| video | `video_play_actions`, `video_p75_watched_actions`, `video_thruplay_watched_actions` (suma de `value`) |

#### 7.10.5 Atribución por UTM (`atribucion.mjs`, P5)

"Un registro va a una campaña si su `utm_campaign` o su `utm_content` es el nombre o el id de la campaña o de uno de
sus anuncios" (texto de la UI, ads.js:752). Implementación: índice `normUtm(nombre)` y `id` → `{campanaId, anuncioId?}`
para campañas y anuncios. Para cada registro: primero `utm_content` contra anuncios (da anuncio + su campaña), después
`utm_content` contra campañas, después `utm_campaign` contra anuncios y contra campañas. Primera coincidencia gana; un
registro cuenta para una sola campaña y, como mucho, un anuncio. Una UTM vacía o una macro de Meta sin reemplazar
(`{{ad.name}}`) no busca. Si dos campañas o anuncios comparten nombre, queda el primero de la lista (se pasan primero
los que tuvieron entrega). `repartir(registros, indice)` devuelve los conteos por campaña y por anuncio y `asignados`.

#### 7.10.6 Modo demo (`DEMO_META=1`, D15)

`integraciones/meta-ads.mjs` arma, sin red y sin caché, un mundo determinista que imita a la semilla:

- `VIVOS_DEMO = [-45, -9, 8]`: los días del vivo de cada campaña respecto de hoy (los de W1, W2 y W3 de §10). Cada
  campaña se llama `webinar-<mes del vivo>`, es `OUTCOME_LEADS` y gasta en los 21 días anteriores a su vivo (`PAUSED`
  si el vivo ya pasó, si no `ACTIVE`).
- `ANUNCIOS_DEMO`: los 8 anuncios `anuncio-1` a `anuncio-8` como `[número, campaña (índice en VIVOS_DEMO), días después
  del arranque de la campaña, con video, conjunto]`: 1 en la primera, 2 a 4 en la segunda, 5 a 8 en la tercera.
- Los números de cada día salen de un hash (FNV-1a) de la fecha y el anuncio, así el mismo día da lo mismo en cualquier
  rango: la cuenta gasta entre 20 y 90 por día repartido entre los anuncios activos, CTR 0,8–2,5 % (con fatiga), y
  alcance y frecuencia que suben con los días de entrega.
- `permisos: {ads_read:true, ads_management:false}`, `cuenta.id: 'act_demo'`, nombre y moneda del negocio,
  `creativo.thumb: null`. Mismo formato que los tres modos (pasa por el mismo armado que las respuestas reales).

Las dos tablas se exportan y la semilla las lee en vez de copiarlas (§10): así los `utm_content` de los registros
demo caen en anuncios que existen ese día.

### 7.11 `/api/publico` — la landing pública (P2)

`netlify/functions/publico.mjs`: `config = { path: '/api/publico', method: ['GET'] }`. Sin sesión, sin cookies.

Headers: `Cache-Control: public, max-age=0, must-revalidate`,
`Netlify-CDN-Cache-Control: public, durable, s-maxage=60, stale-while-revalidate=300`, `Netlify-Cache-Tag: publico`
(la app purga el tag al guardar la landing o activar un webinar; "los cambios aparecen en menos de un minuto").

```json
{
  "ok": true,
  "cliente": { "nombre": "Academia Faro", "color": "#2563eb" },
  "pixel": "123456789012",
  "webinar": {
    "id": "w20261104k3x9", "formato": "Masterclass en vivo", "zona": "America/Bogota",
    "inicio": "2026-11-05T00:00:00.000Z", "popup": null, "duracionMin": 180, "pais": "CO",
    "landing": { "eyebrow": "…", "titulo": "…", "…": "…",
                 "preguntas": [ { "id": "cuanto-podes-invertir", "texto": "¿Cuánto podés invertir en tu formación?",
                                  "opciones": ["Nada por ahora", "Menos de 500", "500 a 1.000", "Más de 1.000"] } ] }
  }
}
```

- `webinar` = el activo; sin activo (o inexistente) → `webinar: null` con `cliente` y `pixel` igual (200).
- `inicio` = `aUTC(fecha, hora, zona)` → siempre `…Z` (el `.ics` de gracias.js depende de eso; una `hora` inválida
  cuenta como `00:00`). `popup` igual o `null`.
- `duracionMin` y `pais` (= `negocio.pais`) son campos nuevos que leen las ediciones E-28/E-29/E-30 de §9.
  `duracionMin` = `duracionDe(w, negocio())` (§6.11): la del webinar si es un número finito > 0, si no la del negocio;
  un `duracionMin` guardado como `'Infinity'` no sale `null`. Un webinar activo con la fecha rota sale como
  `webinar: null` (y se loguea).
- `landing` = `landingPublica(...)`: igual a la guardada **sin `calificadas`** (no se publica el criterio). `landing`
  siempre objeto y `landing.preguntas` siempre array (`[]` si no hay). Las preguntas salen de `registros.preguntasDe`
  (§6.11), como en `/api/registro`: mismos ids, solo `{id, texto, opciones}` y ninguna sin opciones (trabaría el paso 2).
- Lecturas: `ajustes/negocio`, `integraciones/meta` y el webinar activo (`ajustes/estado` + `webinars`).
- `pixel` = id del píxel de Meta (string `^\d{5,20}$`) si la integración meta tiene píxel y no es demo; si no `null`.

### 7.12 `/api/registro` — alta y respuestas (P2)

`netlify/functions/registro.mjs`: `config = { path: '/api/registro' }` (sin `method`, para poder contestar el 405
exacto: cualquier método que no sea `POST` → `405 {error:'Método no permitido'}` con `Cache-Control: no-store`).
Sin sesión. Cuerpo máx. 8 KB. **El cliente solo mira el status**: todo error va con status no 2xx; un 200 siempre es éxito.

#### 7.12.1 Paso 1 (sin `paso`): alta

Request:
```json
{ "nombre": "Juan Pérez", "email": "Juan@Example.com", "pais": "CO", "whatsapp": "300 555 1234", "hp": "",
  "utm": { "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "Webinar Noviembre", "utm_content": "anuncio-2" },
  "eventId": "3f0c2b7e-8a7d-4a43-9f8e-0b1d6c1c2a11", "fbp": "fb.1.1730000000000.123", "fbc": "",
  "url": "https://mi-webinar.netlify.app/?utm_source=fb", "ref": "https://l.instagram.com/" }
```

Orden de chequeos:

| # | Chequeo | Si falla |
|---|---|---|
| 1 | `hp` no vacío (honeypot) | `200 {ok:true, nuevo:false, eventId, preguntas:false, ref:'', firma:''}` sin guardar ni mandar nada |
| 2 | Límite por IP: `incrementar('limites', 'reg:<ip>:<YYYYMMDDHH UTC>')` > `REGISTRO_LIMITE_HORA` | `429 {error:'demasiados'}` |
| 3 | Webinar activo existe y no `terminado(w, negocio())`: `ahora ≤ inicio + duracionDe(w, negocio)` (la del webinar o, si no tiene, la del negocio; con la fecha rota, cerrado; una hora inválida cuenta como `00:00`) | `410 {error:'cerrado'}` |
| 4 | `nombre` (string, con espacios simples) 2–80 | `400 {error:'nombre'}` |
| 5 | `email` (string, trim y minúsculas) `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` y ≤ 254 | `400 {error:'email'}` |
| 6 | `pais` ∈ los 20 (si no, `negocio.pais`); `telefono.normalizar(pais, whatsapp)` (`whatsapp` string o number, hasta 40) | `400 {error:'whatsapp'}` |

La `firma` del registro (y su id, `nuevoId('r_')`) se calcula entre el 1 y el 2, antes de cualquier efecto.

Después:
- `utm`: solo las 5 claves, `texto(v, 300)` y `normUtm`. `eventId` `/^[\w-]{8,64}$/` o uno nuevo (`crypto.randomUUID()`).
- **Dedupe** dentro del webinar: hay un registro con el mismo `email`, o con el mismo `whatsapp` E.164 → no se crea
  ni se cambia nada (las UTM del primer contacto quedan) y se responde
  `200 {ok:true, nuevo:false, eventId: <el guardado>, preguntas:false, ref:'', firma:''}`. **Sin `ref` ni `firma`**: con
  el email de otra persona no se puede contestar su paso 2 (el navegador solo los usa con `nuevo:true`).
- **Dos altas iguales a la vez** (doble clic, dos pestañas): antes de guardar se toman dos candados atómicos en
  `limites` (`incrementar`), `alta:<webinarId>:<huella del email>` y `alta:<webinarId>:<huella del WhatsApp>` (huella =
  32 hex de sha256: el dato no va en claro en el id). Si alguno ya estaba tomado, se espera hasta 2 s (cada 150 ms) a
  que aparezca el registro de la otra y se responde como duplicado; si no aparece, se sigue (mejor un registro de más
  que una persona trabada). Los candados se limpian con los límites (48 h).
- La `firma` se calcula **antes** de cualquier efecto: sin `SESION_SECRETO` el alta da 500 sin haber guardado ni
  mandado nada.
- Alta: `guardar('registros', {id, w, dia: diaLocal(ahora), nombre, email, pais, whatsapp: e164, tel8, utm, eventId,
  eventIdCR:null, fbp (≤ 500), fbc (≤ 500), url (≤ 500), referrer: ref (≤ 500), ip (≤ 64), ua (≤ 300),
  paisGeo: context.geo?.country?.code (≤ 8) || '', respuestas:{}, respondio:false, calificado:null, ac:null, meta:null,
  metaCR:null})`.
- Respuesta `200 {ok:true, nuevo:true, eventId, preguntas: preguntasDe(landing).length > 0, ref: id, firma: firmar('registro', id)}`.
- Efectos con `context.waitUntil(despacharRegistro(reg, {evento:'Lead'}))` (§7.15): ActiveCampaign (si está
  conectada) y Meta CAPI `Lead` con `event_id = eventId` (el mismo que el píxel del navegador). Sin `waitUntil` (otro
  runtime), se esperan antes de responder.

#### 7.12.2 Paso 2 (`paso:'respuestas'`)

Request `{"paso":"respuestas","ref":"r_lq3k9x2ab3cd","firma":"Yk3…","respuestas":{"cuanto-podes-invertir":"Más de 1.000"}}`.

- `verificarFirma('registro', ref, firma)` → si no, `403 {error:'firma'}`. Registro inexistente → `404 {error:'otro'}`.
  Ya respondió → `409 {error:'otro'}` (se acepta una sola vez). El navegador ignora estos errores y va a `/gracias`.
  Dos pedidos a la vez (la landing reenvía con cada toque): pasa solo el primero, con el candado `limites/p2:<ref>`
  (`incrementar`); el resto, `409 {error:'otro'}`. Si guardar falla, el candado se devuelve (−1) para poder reintentar.
- Se guardan solo las respuestas con `id` de una pregunta actual del webinar del registro (`preguntasDe`, §6.11) y
  valor (string) ∈ sus `opciones`.
- `calificado = calificar(preguntas, respuestas)` (7.12.3). `respondio = true`. Se escribe con `fusionarSi`
  (`{respuestas, respondio, calificado, eventIdCR}`): si el registro se borró entre la lectura y la escritura, no se
  recrea con solo las respuestas; se devuelve el candado (−1) y la respuesta es `404 {error:'otro'}`.
  Si `calificado === true`: `eventIdCR = eventId + '-cr'` y `waitUntil(despacharRegistro(reg, {evento:'CompleteRegistration'}))`.
- Respuesta `200 {ok:true, calificado, eventId: eventIdCR}` (`eventId: null` si no calificó).

#### 7.12.3 Regla de "calificado"

Preguntas que cuentan = las que tienen `calificadas.length > 0`. Si ninguna cuenta → `null`. Si alguna cuenta:
`true` cuando **en cada una** la respuesta está en sus `calificadas`; si no (o si no la contestó) `false`. Un registro que
nunca respondió el paso 2 queda `null`.

### 7.13 `/api/tablero` — Inicio, KPIs y Funnel (P2)

`netlify/functions/tablero.mjs`: `config = { path: '/api/tablero', method: ['GET'] }`. Roles E/C. Sin query.

```json
{
  "ok": true,
  "webinarActivo": "w20261104k3x9",
  "webinars": [
    { "id": "w20261017a1b2", "nombre": "Clase en vivo · octubre", "fecha": "2026-10-17", "hora": "19:00", "ventana": 10,
      "popup": { "fecha": "2026-10-19", "hora": "19:00" },
      "proyeccion": { "entrada": { "...": "las 11 claves con la vara" }, "cpl": 1.25, "...": "§7.3.3 completo" },
      "registros": { "total": 612, "calificados": 141, "respondieron": 370,
                     "porFuente": { "fb": { "n": 401, "cal": 98, "resp": 240 }, "(sin UTM)": { "n": 40, "cal": 6, "resp": 20 } },
                     "porDia": { "2026-09-27": { "n": 18, "cal": 4 } } } }
  ]
}
```

- `webinars` ordenados por `fecha` y `hora` **ascendente** (el frontend camina la lista en orden y compara `i` con `i-1`).
  Cada uno: `{id, nombre, fecha, hora ('' si falta), ventana (10 si falta), popup (el guardado si tiene fecha; si no
  null), proyeccion, registros}`. `webinarActivo` como en `inicio`.
- `proyeccion` = `calcular(w.proyeccion, vara)` completo, con `entrada` (las 11 claves; `pctAgenda`, `pctShow` y
  `pctCierre` nunca `null` gracias a la vara).
- `registros` siempre objeto (ceros y `{}` si no hay). `porFuente` con la clave exacta `'(sin UTM)'`. `porDia` con días locales.

### 7.14 `/.netlify/functions/salud` (P7)

Archivo `netlify/functions/salud.mjs` **sin `config.path`**. `GET`, roles E/C (el header `x-hub-key` se ignora).
Sin llamadas externas: lee estados guardados.

```json
{ "ok": true, "cuando": "27/10 11:05",
  "servicios": [
    { "nombre": "Base de datos", "estado": "ok", "detalle": "Supabase", "cuando": "27/10 11:05" },
    { "nombre": "Sesiones", "estado": "ok", "detalle": "Cookie firmada", "cuando": "27/10 11:05" },
    { "nombre": "Meta Ads", "estado": "ok", "detalle": "Cuenta Academia Faro · USD", "cuando": "26/10 18:40" },
    { "nombre": "Píxel de Meta", "estado": "pendiente", "detalle": "Modo prueba activo (TEST12345)", "cuando": "26/10 18:40" },
    { "nombre": "Calendarios", "estado": "mal", "detalle": "Calendly: La clave no es válida", "cuando": "27/10 11:00" },
    { "nombre": "Envíos de registros", "estado": "ok", "detalle": "Sin pendientes", "cuando": "27/10 11:05" }
  ] }
```

| Servicio | `ok` | `pendiente` | `mal` |
|---|---|---|---|
| Base de datos | driver `supabase`, o `archivo` fuera de Netlify | — | la lectura falla (la fila de `archivo` en Netlify, «Los datos se pierden: configurá Supabase», quedó en el código pero no se alcanza: ver abajo) |
| Sesiones | `SESION_SECRETO` ≥ 32 | — | (no se alcanza: ver abajo) |
| cada integración **conectada** (las `sin` no se listan) | estado `ok` | `incompleta`, o meta con `testCode` | `error` |
| Calendarios (solo si `iclosed` o `calendly` están conectadas) | última sync sin errores en < 1 h | nunca corrió, o la última fue hace más de 1 h | alguna fuente con `error` |
| Envíos de registros (solo si `ac` o el píxel de `meta` están conectados) | `cola` sin elementos con ≥ 3 intentos | — | hay elementos con ≥ 3 intentos |

- `cuando` (arriba) = hora local del negocio `dd/mm HH:MM`. Cada servicio trae además su `cuando`: el de la última
  prueba de la integración (`probado`), el de la última sync en Calendarios y el de ahora en el resto (`''` si no hay).
- Textos de "Base de datos": `'Supabase'`, `'Archivos locales (solo para probar)'` o, si la lectura falla, `'No pude
  leer los datos: revisá SUPABASE_URL y la clave'` / `'No pude leer la carpeta de datos'` (y no se mira nada más).
- Integraciones: se listan las que tienen clave (`estadoPublico` ≠ `sin`), con su nombre (`Meta Ads`, `Calendly`,
  `iClosed`, `Fathom`, `IA (Claude)`, `ActiveCampaign`); `incompleta` dice `'Falta elegir <lo que falta>'`. Meta da dos
  filas: «Meta Ads» (`pendiente` sin cuenta; `ok` con `'Cuenta <nombre> · <moneda>'`) y «Píxel de Meta» (`pendiente` sin
  píxel o con `testCode`, `'Modo prueba activo (<código>)'`; si no, `ok`). En modo demo, una sola fila «Meta Ads» `ok`
  con `'Modo demo: datos de ejemplo'`. Con origen `env`, el detalle de Meta suma `' (variable de entorno)'`.
- "Calendarios" mira las fuentes **conectadas** (§6.9); "Envíos de registros" aparece si `ac` está conectada o si meta
  tiene token y píxel (fuera del modo demo).
- **Envíos de registros** cuenta solo la cola de los servicios que todavía tienen clave (`ac` → la clave de `ac`;
  `meta` y `metaCR` → la de `meta`; los servicios desconocidos se ignoran), igual que `procesarCola`: lo de un servicio
  desconectado sale de la cola en la próxima corrida (§7.15) y no se pide arreglar algo que ya no está. Sin trabados:
  `'Sin pendientes'` o `'N en cola para reintentar'`.
- **Lo que salud no puede mostrar:** salud llama a `requerir()` antes de armar la lista. Sin `SESION_SECRETO` (o con
  menos de 32 caracteres) `requerir()` responde `500 {error:'Falta configurar SESION_SECRETO'}`, y en Netlify con el
  driver `archivo` el almacén responde `500 {error:'Falta configurar Supabase: …'}` (§6.2). En los dos casos la
  tarjeta del menú **se oculta** (shell.js no la muestra si `!r.ok`) y el diagnóstico es ese 500 con su mensaje, que
  también ve la persona al entrar. Las filas «Sesiones: mal» y «Base de datos: archivo en Netlify» no salen nunca.

### 7.15 Envíos de un registro y `envios-cron` (P2)

`despacharRegistro(reg, {evento})`:
- `evento:'Lead'` → si `ac` conectada (clave, URL y lista): `activecampaign.sincronizar(reg, webinar)` →
  `reg.ac = {ok:true, t}` o `{ok:false, error, t}`; si meta está lista para la CAPI (token y píxel, o modo demo):
  `metaCapi.enviar('Lead', reg)` → `reg.meta = ...`. Los dos a la vez.
- `evento:'CompleteRegistration'` → solo Meta → `reg.metaCR = ...`.
- Integración no conectada → el campo queda `null` (se ve "—").
- Cada falla crea (o reemplaza, con `guardar`) `cola/<regId>:<servicio>` `{registro, servicio, intentos:1, proximo:
  ahora + 10 min, error}`.
- Los resultados se escriben en el registro con **`fusionarSi('registros', id, {ac?, meta?, metaCR?})`**, sin un
  `obtener` antes: si el registro se borró mientras tanto, no se lo vuelve a crear a medias.
- Nunca tira (lo corre `waitUntil`): un error se loguea.

`netlify/functions/envios-cron.mjs`: `config = { schedule: '*/10 * * * *' }`. Primero la limpieza y después
`procesarCola({max: 40, presupuestoMs: lo que queda hasta los 25 s, como mínimo 5 s})`. Responde
`{ok:true, procesados, errores, descartados, borrados:{limites, cache, cola}}` (nadie lo lee: sirve para el log). Una
limpieza que falla se loguea y no frena el resto.

`procesarCola` → `{procesados, errores, descartados}`. Corta 2 s antes de agotar el presupuesto. **Todas sus
escrituras sobre `registros` y sobre ítems de `cola` que ya estaban van con `fusionarSi`** (solo si siguen existiendo):
un registro o un ítem que se borra en el medio (un registro borrado, la limpieza de los 7 días) no vuelve a medias.

1. **Servicio sin clave** (se desconectó): sus elementos salen de la cola en esta corrida (`descartados`) y el
   registro queda con `{ok:false, error:'Se dejó de reintentar: <ActiveCampaign | Meta> se desconectó', t}`, salvo los
   que ya habían llegado a 5 intentos, que conservan su error. No hay a dónde mandarlos y salud no tiene que pedir que se
   arregle algo que ya no está.
2. **Servicio con clave pero incompleto** (falta la lista de AC o el píxel de Meta): sus elementos esperan en la cola
   sin ocupar los `max` lugares; al completarlo, siguen.
3. Del resto toma los que tienen menos de 5 intentos y `proximo <= ahora` (por `proximo`, de lo más viejo a lo más
   nuevo, hasta `max` o hasta agotar el tiempo) y reintenta (los de AC con su webinar; los de Meta con `Lead` o
   `CompleteRegistration`): si anda, borra el elemento; si falla, `fusionarSi('cola', id, {intentos: intentos+1,
   proximo, error})` con `proximo = ahora + [10 min, 30 min, 2 h, 6 h][intentos-1]` (el `intentos` nuevo); con 5
   intentos queda en la cola con `proximo: null` (salud lo marca). En los dos casos el resultado va al registro con
   `fusionarSi('registros', id, {[servicio]: resultado})`. Se borran sin reintentar los elementos de un registro
   borrado, de un servicio desconocido o un `metaCR` de alguien que no quedó calificado. Los eventos de Meta de un
   registro con `creado` de más de 7 días (menos un minuto) se descartan (Meta no los acepta) y el registro dice por qué
   (`'Se dejó de reintentar: Meta no acepta eventos de más de 7 días'`).

Limpieza: `borrarViejos('limites', ahora − 48 h)` (límites por IP y los candados `arranque:`, `alta:` y `p2:`),
`borrarViejos('cache', ahora − 24 h)` y `borrarViejos('cola', ahora − 7 días)` (lo que se dejó de reintentar o quedó
esperando una integración incompleta).

---

## 8. Integraciones externas

Todas con `fetch` y timeout de 15 s (`AbortSignal.timeout(15000)`), salvo Claude (SDK). Ningún secreto se loguea ni
vuelve al navegador. Toda función de integración recibe las credenciales ya resueltas por `leerIntegracion`.

### 8.1 Meta Marketing API (`integraciones/meta-ads.mjs`, P5)

Base `https://graph.facebook.com/${META_API_VERSION || 'v26.0'}`, `access_token` en query. Paginación: seguir
`paging.next` hasta agotar (tope 20 páginas por consulta; solo se sigue un `next` que apunte a la Graph API). Si una
lista llega al tope con páginas por pedir, la respuesta de `/api/meta-ads` sale con `parcial: true` y se avisa en el
log. `time_range={"since":"<desde>","until":"<hasta>"}`. Plazo de toda la consulta: 45 s (§7.10).

| Para qué | Llamada |
|---|---|
| probar / cuentas | `GET /me/adaccounts?fields=name,account_id,currency,timezone_name&limit=100` |
| píxeles | `GET /act_<id>/adspixels?fields=id,name&limit=100` |
| datos de la cuenta | `GET /act_<id>?fields=name,currency,timezone_name` (caché 24 h) |
| campañas (modo diario) | `GET /act_<id>/insights?level=campaign&time_range=…&fields=campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,actions,action_values&limit=500` |
| serie diaria de cuenta | `GET /act_<id>/insights?time_range=…&time_increment=1&fields=spend,impressions,clicks&limit=500` (`fecha` = `date_start`) |
| anuncios por día | `GET /act_<id>/insights?level=ad&time_range=…&time_increment=1&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,objective,spend,impressions,clicks,actions,action_values,video_play_actions,video_p75_watched_actions,video_thruplay_watched_actions&limit=500` |
| alcance/frecuencia por anuncio | `GET /act_<id>/insights?level=ad&time_range=…&fields=ad_id,reach,frequency&limit=500` |
| alcance/frecuencia de cuenta | `GET /act_<id>/insights?time_range=…&fields=impressions,reach,frequency` |
| metadatos de anuncios | `GET /act_<id>/ads?fields=id,name,effective_status,created_time,campaign{id,name,objective},adset{id,name},creative{thumbnail_url}&effective_status=[…]&limit=200` con la lista explícita `["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","ARCHIVED","DISAPPROVED","PENDING_REVIEW","PREAPPROVED","PENDING_BILLING_INFO","IN_PROCESS","WITH_ISSUES"]`: sin `DELETED` y **con** `ARCHIVED` (sin el filtro, la Graph API puede dejar afuera los archivados). Se filtran además los creados después de `hasta`. En el modo diario solo se piden `id,name,effective_status,created_time,campaign{id,name}` |
| anuncios con entrega sin metadatos | los `ad_id` con gasto o impresiones en los insights que `/ads` no trajo (borrados o más allá del tope) → `GET /<versión>/?ids=<hasta 50 separados por coma>&fields=<los de /ads>`, hasta 20 tandas. Si falla o son más, siguen sin metadatos y la respuesta sale con `parcial: true` (la consulta no se cae por esto) |
| campañas (Planificar) | `GET /act_<id>/campaigns?fields=id,name,effective_status,objective&effective_status=["ACTIVE","PAUSED","ARCHIVED","IN_PROCESS","WITH_ISSUES"]&limit=200` (hasta 3 páginas: máx. 500 en la respuesta) |
| permisos | `GET /me/permissions` → `{ads_read: granted, ads_management: granted}`; si falla, `{ads_read:true, ads_management:false}` |
| resumen | `GET /act_<id>/insights?time_range=…&time_increment=1&fields=spend&limit=500` |

Las miniaturas firmadas de Meta vencen: no se cachean más de `META_CACHE_S`.

### 8.2 Meta Conversions API (`integraciones/meta-capi.mjs`, P2)

`POST https://graph.facebook.com/<versión>/<pixel>/events?access_token=<META_CAPI_TOKEN || token de meta>`:

```json
{ "data": [ { "event_name": "Lead", "event_time": 1761573600, "event_id": "3f0c2b7e-…", "action_source": "website",
              "event_source_url": "https://mi-webinar.netlify.app/?utm_source=fb",
              "user_data": { "em": ["<sha256 email>"], "ph": ["<sha256 dígitos E.164 sin +>"], "fn": ["<sha256 primer nombre en minúsculas>"],
                             "ln": ["<sha256 resto del nombre>"], "country": ["<sha256 pais en minúsculas>"],
                             "external_id": ["<sha256 id del registro>"], "client_ip_address": "190.1.2.3",
                             "client_user_agent": "Mozilla/5.0 …", "fbp": "fb.1.…", "fbc": "fb.1.…" } } ],
  "test_event_code": "TEST12345" }
```

- `event_time` = `creado` del registro (segundos), también en los reintentos. `event_id` = `eventId` (Lead) o `eventIdCR` (CompleteRegistration).
- `test_event_code` solo si la integración meta tiene `testCode`.
- Campos vacíos (`fbp`, `fbc`) se omiten. Hash = SHA-256 hex de lo normalizado (trim + minúsculas).
- `eventoPrueba(testCode)`: `PageView` con `user_data` de un email ficticio `prueba@example.com` e IP `127.0.0.1`.
- Éxito = 200 con `events_received ≥ 1`. Error = `error.message` de Meta (va a `reg.meta.error`).
- `DEMO_META=1` → no se manda nada y el estado queda `{ok:true, t, demo:true}`.

### 8.3 ActiveCampaign (`integraciones/activecampaign.mjs`, P2)

Header `Api-Token: <key>`, base `<url>/api/3`.

| Paso | Llamada |
|---|---|
| probar / listas | `GET /lists?limit=100` → `{lists:[{id, name}]}` |
| contacto | `POST /contact/sync` `{contact:{email, firstName, lastName, phone}}` → `contact.id` |
| lista | `POST /contactLists` `{contactList:{list:<lista>, contact:<id>, status:1}}` |
| etiqueta | id desde `integraciones/ac.tags[etiqueta]`; si no está, `GET /tags?search=<etiqueta>` y si no existe `POST /tags` `{tag:{tag:<etiqueta>, tagType:'contact', description:'Webinar'}}`; se guarda el id |
| asignar etiqueta | `POST /contactTags` `{contactTag:{contact:<id>, tag:<tagId>}}` |

La etiqueta es `webinar.etiqueta`. Ese tag dispara la automatización de mails que configure el negocio en AC.

### 8.4 Calendly (`integraciones/calendly.mjs`, P3)

`Authorization: Bearer <token>`, base `https://api.calendly.com`. `probar`: `GET /users/me` → `resource.name`,
`resource.current_organization`. Sync: §7.5.4.

### 8.5 iClosed (`integraciones/iclosed.mjs`, P3) y Fathom (`integraciones/fathom.mjs`, P7)

iClosed: §7.5.4. Fathom: `X-Api-Key`, `probar` = `GET https://api.fathom.ai/external/v1/teams` → nombres de equipo (si
la respuesta trae `items[]`, `name`; si es array, `name` de cada uno). En esta versión Fathom solo se conecta (la UI
dice "más adelante" para el análisis de grabaciones).

### 8.6 Claude (`integraciones/llm.mjs`, P6)

```js
import Anthropic from '@anthropic-ai/sdk';

export async function probar({ clave }) {
  const client = new Anthropic({ apiKey: clave });
  await client.models.list({ limit: 1 });             // 401 → 'La clave no es válida'
  return { detalle: `Lista para el ICP (${process.env.ICP_MODELO || 'claude-opus-5-5'})` };
}

export async function generarPerfiles(datos, clave) {
  const client = new Anthropic({ apiKey: clave });
  const r = await client.beta.messages.create({
    model: process.env.ICP_MODELO || 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_ICP } },
    system: SISTEMA_ICP,
    messages: [{ role: 'user', content: JSON.stringify(datos) }],
  });
  if (r.stop_reason === 'refusal') throw new Error('La IA no pudo responder este pedido');
  const texto = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(texto);
}
```

- `ESQUEMA_ICP`: objeto con `perfiles` (array de `{titulo, descripcion, rasgos:[{campo, valor}]}`), `lectura` (string),
  `deseos` y `dolores` (arrays de `{titulo, n, frases:[string]}`), todos `required` y `additionalProperties:false`.
- `SISTEMA_ICP` (en castellano): "Sos un analista de ventas. Con estos agregados de registros y llamadas de un webinar,
  armá de 2 a 6 perfiles de comprador. Cada rasgo tiene que usar un `campo` y un `valor` que existan **exactamente**
  en la lista que te paso. Priorizá rasgos que separen a los que compraron. `deseos` agrupa los textos de Objetivo y
  `dolores` los de Traba: `n` es cuántos textos caen en el tema y `frases` son citas textuales cortas de esos textos.
  No inventes números." Más la regla de no incluir datos personales.
- Errores del SDK: 401 → `'La clave de Anthropic no es válida'`; 429/529 → `'Anthropic está saturado: probá en un rato'`; otros → mensaje corto.
- La clave sale de `leerIntegracion('ia').clave` (nunca de `ANTHROPIC_API_KEY` implícita del SDK, para respetar lo cargado en la UI).

---

## 9. Cambios en el frontend

Regla: el frontend queda **igual** salvo esta lista. Las líneas son las del archivo descargado (idéntico a
`_original/`); si una edición anterior corre la numeración, buscar por el texto "antes". Donde el texto original
nombraba a personas, negocios o productos reales (o traía sus cifras), la columna «Antes» lo describe en vez de
copiarlo, para que este documento pase el grep de §14.4; todas esas ediciones ya están aplicadas en `public/`. Tipos:
**[F]** funcional (lo necesita el backend o la genericidad), **[G]** texto o dato de un negocio concreto,
**[L]** limpieza de comentarios o restos de otro proyecto. Todas son obligatorias salvo las marcadas *(opcional)*.

### 9.1 Núcleo de la app

| Id | Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|---|
| E-01 | `public/app/js/base.js:187-188` | `try { await apiAcceso('salir'); } catch (err) {}` / `mostrarGate();` | `try { await apiAcceso('salir'); } catch (err) {}` / `location.reload();` (sin recargar, otra persona en la misma pestaña heredaba `E.inicio` y `DB_CACHE` del anterior) | F |
| E-02 | `public/app/js/base.js:216` | `route();` | `route();` / `if (typeof revisarSalud === 'function') revisarSalud();` (la llamada de shell.js salía antes del ingreso y recibía 401; E-47 la saca, así que esta es la única) | F |
| E-03 | `public/app/index.html:72-73` (entre `</nav>` y `<div class="sidebar-foot" id="sidebarFoot"></div>`) | — | `<div class="side-card" id="sideSalud" hidden onclick="irASalud()" role="button" tabindex="0"><span id="sideSaludTxt"></span></div>` (atlas.css:799 ya trae `.side-card`) | F |
| E-04 | `public/app/js/shell.js:124-126` | `const r = await fetch('/.netlify/functions/salud', {` / un header `x-hub-key` con una clave de `localStorage` del hub original / `});` | `const r = await fetch('/.netlify/functions/salud');` | L |
| E-05 | `public/app/js/shell.js:153` | `alert('Conexiones del hub\n\n' + …` | `alert('Conexiones\n\n' + …` | L |
| E-06 | `public/app/js/ui-atlas.js:139` y `:143` | el prefijo de las claves de `localStorage`, con la sigla del sitio original | `'mhqper:'` | L |

### 9.2 Pantallas de la app

| Id | Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|---|
| E-07 | `pantallas/mhq.js:117` | el placeholder del nombre del webinar, con el producto del negocio original | `'Ej.: Clase en vivo · noviembre'` | G |
| E-08 | `pantallas/mhq.js:172` | `` `${vara[k]} (vara <sigla del negocio original>)` `` | `` `${vara[k]} (referencia)` `` | G |
| E-09 | `pantallas/mhq.js:175` | `Vacío = la vara de…` seguido de la masterclass del negocio original, su fecha y la versión de su procedimiento. `El % de cierre es un supuesto.` | `Vacío = el valor de referencia de la configuración. El % de cierre es un supuesto.` | G |
| E-10 | `pantallas/mhq.js:288` | un tema de ejemplo con la oferta del negocio original | `'Tema 1 \| Qué se lleva la persona de esta parte'` | G |
| E-11 | `pantallas/mhq.js:300` | una cifra de clientes del negocio original | `'+10 años enseñando'` | G |
| E-12 | `pantallas/mhq.js:303` | una pregunta frecuente del nicho del negocio original `\| No…` | `'¿Necesito experiencia previa? \| No…'` | G |
| E-13 | `pantallas/mhq.js:315` | `'¿Cuánto ganás hoy al mes?'` | `'¿Cuánto podés invertir en tu formación?'` | G |
| E-14 | `pantallas/mhq.js:316` | los tramos de ingreso en US$ del negocio original, con sus dos calificadas (su criterio real) | `'Nada por ahora\nMenos de 500\n* 500 a 1.000\n* Más de 1.000'` | G |
| E-15 | `pantallas/mhq.js:340` | `'Ponele el nombre del cliente y copiala.'` | `'Ponele un nombre que la identifique y copiala.'` | G |
| E-16 | `pantallas/inicio.js:405` | `…es el supuesto de <sigla del negocio original> (20%)` | `` …es el supuesto por defecto (${(window.MHQ && MHQ.opciones && MHQ.opciones.vara && MHQ.opciones.vara.pctCierre) \|\| 20}%) `` (está dentro de un template literal) | G |
| E-17 | `pantallas/ads.js:1354` y `:1362` | comentario `…son de Argentina: se les pone 549.` · `if (d.length === 10) return '549' + d;` | comentario `…se les pone el prefijo del negocio (cliente.prefijoTel).` · `if (d.length === 10) { const p = (window.MHQ && MHQ.cliente && MHQ.cliente.prefijoTel) \|\| ''; return p ? p + d : d; }` | F |
| E-18 | `pantallas/ads.js:1173` | `` `Presupuesto cargado: US$ ${uiNum(pres)}/día…` `` | `` `Presupuesto cargado: ${pref()}${uiNum(pres)}/día…` `` | F |
| E-19 | `pantallas/ads.js:1187` | `` `<span>US$ ${esc(uiNum(num(d.presupuesto)))}/día</span>` `` | `` `<span>${pref()}${esc(uiNum(num(d.presupuesto)))}/día</span>` `` | F |
| E-20 | `pantallas/ads.js:1217` · `:1220` · `:1735` | un placeholder con la fecha de un webinar del negocio original · `Presupuesto diario (USD)` · `\|\| 'ARS'` | `placeholder="Ej: Webinar de noviembre · captación"` · `` Presupuesto diario (${MON()}) `` · `\|\| '—'` | G/F |
| E-21 | `pantallas/agendas.js:1200` · `:1413` | el placeholder y el mensaje de error del monto, con el precio del negocio original como ejemplo | `placeholder="ej. 1000"` · `'El monto tiene que ser un número (ej. 1000)'` | G |
| E-22 | `pantallas/agendas.js:1465` | `placeholder="+54 9 11 …"` | `placeholder="+código de país y número"` | G |
| E-23 | `pantallas/agendas.js:2179` | el nombre real de una persona, escrito de dos formas, en un comentario | `("Juan Pérez" y "juan perez")` | G |
| E-24 | `pantallas/utms.js:391` · `:399` · `:406` | ejemplos con piezas de contenido del negocio original (uno con su cifra de facturación) · `'webinar-noviembre'` y el slug de una de esas piezas | `'Ej: Anuncio 1 · video corto'` · `'webinar-noviembre'`, `'anuncio-1'` · `'Ej: el video del testimonio'` | G |
| E-25 | `pantallas/crm.js:73` y `:357` | `timeZone: 'America/Argentina/Buenos_Aires'` | `timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) \|\| 'America/Argentina/Buenos_Aires'` | F |
| E-26 | `pantallas/crm.js` y `pantallas/finanzas.js` (moneda) | `'USD'` y `USD` escritos en etiquetas y textos (crm.js: 183, 242-246, 271, 302, 311, 314, 355, 366, 520, 536, 575, 609, 614, 639, 701-702; finanzas.js: 41, 97, 311, 326, 341, 368, 408, 411, 461, 467, 470-472, 492, 498-499, 515, 521, 619-625, 693, 701, 717, 752-753, 809-810, 818, 823, 845-846, 854) | Agregar al comienzo de cada IIFE `const MON = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) \|\| 'USD';`. En template literals `USD` → `${MON()}`; en strings con comillas `'USD'` → `MON()` y `'… (USD)'` → `'… (' + MON() + ')'`. **No** tocar `'USDT'` (crm.js:493, medio de pago). Verificación: `grep -n "USD" crm.js finanzas.js` solo muestra la línea de `MON` y `'USDT'`. | F |
| E-27 | `pantallas/finanzas.js:136` | ``if (j.moneda && j.moneda !== 'USD') return { error: `la cuenta de Meta está en ${j.moneda} y el CRM en USD: …` }`` | ``if (j.moneda && j.moneda !== MON()) return { error: `la cuenta de Meta está en ${j.moneda} y el CRM en ${MON()}: sin tipo de cambio no se pueden dividir` }`` | F |

### 9.3 Landing pública y gracias

| Id | Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|---|
| E-28 | `public/js/landing.js:62` | `const def = paisDeZona() \|\| 'AR';` | `const def = paisDeZona() \|\| w.pais \|\| 'AR';` | F |
| E-29 | `public/js/landing.js:162` | `Date.parse(w.inicio) + DURACION_MS` | `Date.parse(w.inicio) + (Number(w.duracionMin) > 0 ? w.duracionMin * 6e4 : DURACION_MS)` | F |
| E-30 | `public/js/gracias.js:25` | `Date.parse(w.inicio) + 2 * 36e5` | `Date.parse(w.inicio) + (Number(w.duracionMin) > 0 ? w.duracionMin * 6e4 : 2 * 36e5)` | F |
| E-31 | `public/js/comun.js:16` | un comentario con la promesa del negocio original y su cifra de facturación mensual | `"Tu promesa y *el resultado*"` | G |
| E-32 | `public/js/landing.js:1-3`, `public/js/gracias.js:1-3` y `:88` | comentarios que nombran a otros negocios | mismo comentario sin nombres de terceros | L |

### 9.4 Limpieza de comentarios y color *(opcional, recomendada antes de publicar el repo)*

| Id | Qué | Regla |
|---|---|---|
| E-33 | Comentarios con nombres de otros proyectos | En `public/**/*.{js,css,html}`, reescribir los comentarios que nombran al negocio original, a su hub y a su sistema de diseño, a otros tableros y documentos internos de ese equipo, o que traen cifras reales de ejemplo (ads.js:88, 277, 383; ui-atlas.js:106, 295-296; ui.js:225) como descripción neutra ("el sistema de diseño", "el hub original" → "la app"). Solo comentarios: no cambia código. Verificación: el grep de §14.4 sobre `public` deja solo los tokens técnicos. |
| E-34 | Color de marca por defecto | `public/css/landing.css:6`, `public/js/comun.js:29`, `public/app/css/pantallas/mhq.css:3` y los favicon de `public/index.html:5`, `public/gracias.html:5`, `public/app/index.html:8`: `#d4a53a` → `#3b82f6` (el color real lo pone `cliente.color` en tiempo de ejecución). El dorado del sistema de diseño de la app (`--gold` en atlas.css/calco.css y los CSS de pantallas) **se deja**: es el tema visual de la plantilla, no la marca del negocio. |
| E-35 | Mapa mundial | *(opcional)* bajar `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json` a `public/app/vendor/countries-110m.json` y cambiar la URL en `pantallas/ads.js:1539` a `/app/vendor/countries-110m.json`. |

### 9.5 Ediciones que sumó la revisión de completitud

| Id | Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|---|
| E-36 | `pantallas/finanzas.js:40` | `timeZone: 'America/Argentina/Buenos_Aires'` (la hora de "Actualizado hh:mm") | `timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) \|\| 'America/Argentina/Buenos_Aires'` (E-25 no lo cubría) | F |
| E-37 | `public/app/css/atlas.css:107`, `:108`, `:1046`, `:1065` y `public/app/css/calco.css:145` | un selector `.foot-<apodo>` con el apodo de una persona (en código y no en un comentario) | `.foot-credito` en las cinco líneas. Ningún HTML ni JS usa la clase (verificado con grep): también se pueden borrar esas reglas | L |
| E-38 | `pantallas/agendas.js:2173-2174` *(opcional)* | `txt: 'Más de 3.000 USD'`, `'2.000 a 3.000 USD'`, `'1.000 a 2.000 USD'`, `'Menos de 1.000 USD'` | los mismos textos sin `' USD'`. Los tramos están en la moneda del negocio y `CAPITALES` se arma al cargar el archivo, antes de que exista `MHQ` (por eso no sirve `MON()` acá) | G |
| E-39 | `pantallas/mhq.js:122`, `:188`, `:205`, `:490` *(opcional)* | `checklist del SOP` / `Checklist del SOP` | `checklist del webinar` / `Checklist del webinar` (la checklist es propia: §13 #11; la línea 175 ya la cubre E-09) | G |
| E-40 | `public/app/js/base.js:28`, `pantallas/ads.js:148` y `pantallas/crm.js:39` | `mostrarGate('Tu sesión se cerró: entrá de nuevo con tu link.')` en cada 401 | base.js: `if (YO) mostrarGate('Tu sesión se cerró: entrá de nuevo con tu link.');` (el `throw new Error('sesion')` queda igual). ads.js y crm.js: agregar `&& typeof YO !== 'undefined' && YO` a la condición. Sin esto, con E-01 (recarga al salir) o con un link a `/app/#ceo`, shell.js pinta la pantalla antes del ingreso, el 401 llega y el gate de una persona que nunca entró dice en rojo "Tu sesión se cerró". Con `YO` en `null` el gate ya está a la vista o lo muestra `boot()` limpio | F |
| E-41 | `pantallas/agendas.js:2204` *(opcional)* | `apiApp('personas').then(…).catch(() => { });` | `.catch(() => { CLOSERS_APP = null; })`: si el primer pedido falla (p. ej. 401 antes del ingreso), se reintenta en la próxima pantalla en vez de quedar con la lista vacía hasta recargar | F |
| E-42 | `pantallas/mhq.js:553` *(opcional)* | `con(null, () => cambiarTareas({ tarea: t.dataset.id, hecha: t.checked }));` | `con(null, () => cambiarTareas({ tarea: t.dataset.id, hecha: t.checked }).catch((e) => { t.checked = !t.checked; throw e; }));`: si el guardado falla, el checkbox vuelve atrás en vez de mostrar una tarea hecha que no se guardó | F |

No se cambian: los textos genéricos en castellano (gate "Masterclass HQ" es el nombre del producto), los tramos de
capital `<1K…>3K`, los orígenes `MASTERCLASS/WEBINAR/IG/WPP`, la rúbrica por defecto, el locale `es-AR`, la FAQ
automática "¿A qué hora es en mi país?" y el aviso de Meta del pie.

### 9.6 Ediciones de la ronda de cierre (27/10/2026)

Las líneas son las de `_original/`; en `public/` corren 1 en finanzas.js por la línea de `MON` (E-26).

| Id | Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|---|
| E-43 | `pantallas/mhq.js:119` y `:121` (formulario "Nuevo webinar") | `name="hora" value="20:00"` · `name="popupHora" value="20:00"` | `value="${E.inicio.cliente.horaPorDefecto \|\| '20:00'}"` en las dos (pasa por el `html` del archivo: queda escapado). La hora la manda `inicio` (§7.3.1) | F |
| E-44 | `pantallas/mhq.js:449` (`ACC.desconectar`) | `await api('desconectar', { cual: d.k }); … trasCambio(d.k, { ok: true, detalle: 'Desconectada' })` | `const r = await api('desconectar', { cual: d.k }); … trasCambio(d.k, { ok: true, detalle: r.detalle \|\| 'Desconectada' })`: el modal dice si sigue conectada por la variable de entorno o por el modo demo (§7.3.11) | F |
| E-45 | `pantallas/finanzas.js:576`, `:577`, `:579`, `:586` (Transacciones) y `:807`, `:809-810` (Liquidaciones) | `` `$${…}` `` en Cash collected, Ventas nuevas, Ticket promedio (valor y tooltip «Cash $…») y el Monto de cada fila; `` const $0 = (n) => `$${uiNum(n, 2)}` ``; etiquetas `A pagar · ${MON()}` y `Pagado · ${MON()}` (después de E-26) | `` `${MON()} ${…}` `` (como el resto de la pantalla, p. ej. `fU`); `` const $0 = (n) => `${MON()} ${uiNum(n, 2)}` ``, con lo que Cash del mes, el tooltip de Comisiones y la columna Cobrado salen con la moneda; las etiquetas quedan `A pagar` y `Pagado` (si no, la moneda salía dos veces en el mismo recuadro). Verificación: en finanzas.js no queda ningún `$` de dinero; en crm.js los `'$'` de `FILAS_LB` (279-283) son una marca de tipo interna que `fmt` traduce a número, no se ven | F |
| E-46 | `pantallas/agendas.js:2310-2323` (submit de `#addform`, Pipeline) | el `add` sin bloquear el botón | antes del pedido, el botón submit queda `disabled` con «Guardando…»; en un `finally` vuelve a «Guardar» y habilitado, salga bien o mal (mismo patrón que `agCenGuardarNueva`; acá se rehabilita también al salir bien porque el formulario no se cierra como el modal). Un doble clic manda un solo `add`; el id fijo del alta (§7.4.5) cubre igual dos pedidos que lleguen juntos | F |
| E-47 | `public/app/js/shell.js:118` (adentro de `revisarSalud`) y `:190` (`DOMContentLoaded`) | `revisarSalud` sin guarda · `setTimeout(revisarSalud, 1200);` | primera línea de `revisarSalud()`: `if (typeof YO === 'undefined' \|\| !YO \|\| YO.rol === 'closer') return;`, y se borra el `setTimeout` (la llama E-02 después del ingreso). Sin sesión ya no hay 401, al closer no se le pide (no hay 403) y no sale dos veces | F |
| E-48 | `public/app/js/shell.js:165` (`pantallaActual`) | sin guarda | primera línea: `if (typeof YO !== 'undefined' && !YO) return;`. Las pantallas no piden datos antes del ingreso (daban 401); `boot()` → `route()` las pinta | F |
| E-49 | `public/app/js/base.js:101` | `window.addEventListener('hashchange', () => { if (YO) route(); });` | `if (new URLSearchParams(location.hash.slice(1)).get('k')) { location.reload(); return; }` antes del `if (YO) route();`. Un link `/app/#k=…` pegado en una pestaña con la app ya abierta solo cambiaba el hash: sin sesión seguía el gate, y con la sesión de otra persona `route()` lo cambiaba por `#ceo` y seguía la anterior. Ahora recarga y `boot()` entra con ese código | F |
| E-50 | `pantallas/mhq.js:251` (Registros) | `` `${Math.round((100 * r.total) / obj)}% del objetivo (…)` `` | `` `${pctTxt((100 * r.total) / obj)} del objetivo (…)` `` con `const pctTxt = (x) => num(x, x !== 0 && Math.abs(x) < 10 && x % 1 ? 1 : 0) + '%';` (la regla de `pc1` de inicio.js): 1 registro de 400 decía «0 %» acá y «0,3 %» en el Inicio | F |
| E-51 | `pantallas/mhq.js:39-40` y `pantallas/inicio.js:237-238` (`plata`) | `Intl.NumberFormat('es-AR', { style: 'currency', currency: … })` | lo mismo con `currencyDisplay: verMoneda(moneda)`, donde `verMoneda` da `'code'` si el símbolo de esa moneda en `es-AR` es `$` a secas (hoy, solo `ARS`) y `'symbol'` si no. Con `NEGOCIO_MONEDA=ARS`, Webinar, Inicio, KPIs y Funnel decían «$ 225.000» y Ventas y Finanzas «ARS 225.000»; ahora todos «ARS». USD sigue en «US$» | F |
| E-52 | `pantallas/agendas.js:50` y `:1127` | `const usd = (n) => '$' + …` · `'$' + uiEsc(r.Monto)` | `const pre$ = () => (MON() === 'USD' ? '$' : MON() + ' ');` y `pre$()` en los dos lugares (`uiEsc(pre$())` en el segundo). En dólares queda el `$` original; en otra moneda, su código, como `usdT` y E-26 (podio, Comparativa, resumen del día, historial, reporte, ficha de evaluación y tabla de la Central) | F |
| E-53 | `public/js/gracias.js:39` (sin webinar) | `if (!w) { $('#titulo').textContent = 'Tu registro quedó guardado.'; return; }` | sin webinar: la marca si se conoce, sin el aviso «No cierres esta página»; si `sessionStorage` tiene `mhq_nombre` (se registró en esta pestaña) el título queda «Tu registro quedó guardado.» con el progreso completo; si no (entró directo), «No hay una clase abierta en este momento.», como la landing, y sin la barra de progreso | F |

---

## 10. Semilla de demo (`scripts/semilla.mjs`, P8)

Un negocio **ficticio** que alcanza para pintar todas las pantallas. Sin nombres de personas ni marcas reales: los
nombres salen de combinar listas de nombres y apellidos comunes, los mails son `@example.com` y los teléfonos usan el
rango `555`. Generador pseudoaleatorio con semilla fija (mulberry32 sembrado con `'faro'`) para que dos corridas den lo mismo.

Uso: `node scripts/semilla.mjs [--reset | --borrar] [--hoy=YYYY-MM-DD] [--si-supabase]` (o `npm run semilla -- …`).
Escribe con la fachada `almacen`: anda igual con `archivo` y con Supabase. Lee `.env` igual que `scripts/dev.mjs`, y
`SESION_SECRETO` tiene que ser el mismo que usa el servidor (con él se guardan los códigos).

**Modo demo de Meta, una sola fuente.** La semilla importa `ANUNCIOS_DEMO` y `VIVOS_DEMO` de
`netlify/lib/integraciones/meta-ads.mjs` (§7.10.6) en vez de copiarlos: de ahí salen los anuncios de cada campaña y el
día desde el que cada uno está activo, para que el `utm_content` de cada registro pago sea un anuncio que el modo demo
muestra ese día. Si los días de sus webinars (`H−45`, `H−9`, `H+8`) no coinciden con `VIVOS_DEMO`, frena con
`Error('semilla: los días de los webinars no coinciden con VIVOS_DEMO de integraciones/meta-ads.mjs')`.

- Sin flags: carga la demo, o la pone al día. **Idempotente:** los ids son fijos (`r_demo0001…`, `ag_demo001…`,
  `v_demo001…`; las cuotas, el `idFijo` de `armarCierre`), así que correrla dos veces no duplica nada. Guarda un
  manifiesto en `ajustes/semilla = {hoy, cuando, ids:{col:[ids]}}`; en la corrida siguiente borra lo que la anterior
  cargó y esta ya no carga (p. ej. los webinars de otro día) y reemplaza el resto. Si la demo era de otro día, con
  `archivo` rehace los registros y las evaluaciones para que su `creado` quede al día. Las personas de la demo
  recuperan su código de demo y conservan sesiones y último ingreso.
- `--borrar` saca **solo** lo del manifiesto (y el manifiesto) y termina: lo cargado a mano queda. Sin demo cargada,
  lo dice y sale con 0.
- `--reset` vacía antes todas las colecciones de §4 y carga la demo de cero (con `archivo` borra `DATOS_DIR`, pero
  antes chequea que adentro haya solo `.json`).
- `--hoy` fija el "hoy" (pruebas reproducibles); por defecto `hoyLocal(zona)`. Solo corre las fechas de la demo: el
  servidor sigue usando el reloj real.
- Contra Supabase se niega a correr sin `--si-supabase` (para no pisar datos reales).
- Errores claros y `exit 1`: sin `SESION_SECRETO` de 32 caracteres o más, con un flag que no conoce, con `--reset` y
  `--borrar` juntos o con un `--hoy` inválido.
- Al final imprime los 4 códigos con su link `<SITIO_URL o http://localhost:PORT>/app/#k=<código>` (8888 por
  defecto), el aviso de que esos códigos son públicos (antes de usar el sitio con datos reales: `--borrar` y crear los
  accesos con `nuevo-acceso.mjs`) y la recomendación de `DEMO_META=1` para que Ads, Inicio, KPIs, Funnel y Finanzas
  muestren gasto.
- **Fecha de alta (`creado`).** La pone el almacén al escribir (la fachada no deja fijarla). Con `archivo`, la semilla
  escribe cada registro y cada evaluación con el reloj corrido a su fecha de alta (un lote por instante), así la tabla
  de Registros, el cruce registro ↔ agenda y los recorridos de Trazabilidad se ven reales. **Con Supabase no se
  puede:** quedan con `creado` = el momento de la carga (su día real está en `dia`) y la semilla lo avisa al terminar.
  Se nota en la columna de fecha de Registros, en el "se registró el" de la ficha del lead y en las medianas
  registro → agenda de Trazabilidad (dan negativas y quedan afuera).
- Tarda unos 14 s con `archivo` de cero y 1 s si se vuelve a correr el mismo día.

`scripts/nuevo-acceso.mjs` (o `npm run acceso -- …`): `<nombre> <rol>` crea la persona (el nombre puede ir sin
comillas), `--codigo <uid>` le genera un código nuevo (si estaba de baja la reactiva y cierra sus sesiones) y `--lista`
muestra los uid. Reusa `acciones.persona` de `lib/app/personas.mjs` (la misma lógica de la pantalla Equipo: nombre
único entre activos, código libre, bloqueo optimista). Imprime el código **una vez** con el link; en la base queda
solo `codigoHash`. Avisa si fue la primera persona (desde ahí `CODIGO_INICIAL` ya no sirve). Los `HttpError` salen
como texto legible con `exit 1`.

`H` = hoy en la zona del negocio.

| Colección | Qué crea |
|---|---|
| `ajustes/negocio` | `{nombre:'Academia Faro', color:'#2563eb', moneda:'USD', zona:'America/Bogota', pais:'CO', prefijoTel:'57'}` |
| `personas` | Ana Demo (`equipo`, `DEMO-EQPO`, uid `u_demo_ana`), Carla Demo (`cliente`, `DEMO-CLTE`, `u_demo_carla`), Laura Gómez (`closer`, `DEMO-LAUR`, `u_demo_laura`), Diego Ruiz (`closer`, `DEMO-DIEG`, `u_demo_diego`), Tomás Vera (`closer`, dado de baja, `codigoHash: null`, `u_demo_tomas`). Los códigos son fijos y **públicos** |
| `webinars` | Ids `w<AAAAMMDD>faro`; los tres a las 19:00 y con `duracionMin: 120`. **W1** "Clase en vivo · <mes de H−45>", `fecha = H−45`, 19:00, ventana 10, `proyeccion {presupuesto:1200, registros:900, ticket:900}`, todas las tareas hechas. **W2** `fecha = H−9`, popup `H−7`, ventana 10, `proyeccion {presupuesto:1500, registros:1200, pctCierre:22, ticket:900}`, tareas con vencimiento pasado hechas salvo 3 (vencidas). **W3** `fecha = H+8`, activo, `proyeccion {presupuesto:1800, registros:1400, ticket:900}`, tareas con vencimiento pasado hechas en un 70 %. Landing genérica con dos preguntas: "¿Cuánto podés invertir en tu formación?" (`Nada por ahora · Menos de 500 · *500 a 1.000 · *Más de 1.000`) y "¿Qué te trae a la clase?" (4 opciones, sin calificadas); `whatsapp: 'https://chat.whatsapp.com/DEMO0000000000000000'` |
| `ajustes/estado` | `{webinarActivo: W3.id}` |
| `registros` | W1: 650 entre `H−66` y `H−45`; W2: 820 entre `H−30` y `H−9`; W3: 230 entre `H−13` y `H` (más por día a medida que se acerca el vivo). `utm_source`: fb 60 %, ig 20 %, youtube 6 %, email 6 %, vacío 8 %; `utm_medium` `paid` para fb/ig y `organic`/`newsletter` para el resto; `utm_campaign = 'webinar-<mes del vivo>'` en los pagos; `utm_content` = uno de los anuncios de la campaña de **su** webinar que ya estaban activos ese día (W1 `anuncio-1`, W2 `anuncio-2` a `4`, W3 `anuncio-5` a `8`: `ANUNCIOS_DEMO`, leída del modo demo de Meta, §7.10.6). 62 % contestó el paso 2 (respuestas con pesos 25/35/25/15 %), `calificado` con la regla de 7.12.3. País CO, `whatsapp +57300555xxxx`. `ac`/`meta` en `null`. Unos 15 repetidos entre webinars (misma persona en W1 y W2) |
| `agendas` | W1: 26 (Fecha call entre `H−44` y `H−35`, todas con resultado); W2: 38 (entre `H−8` y `H+3`: pasadas con resultado salvo 4 "sin cargar", 3 hoy, 6 a futuro); 8 sin registro (Origen `IG` o `WPP`). Estados en las pasadas: Presentada 25 %, Cerrada 20 %, No-show 25 %, Cancelada 10 %, Descalificada 5 %, Re-agenda 5 %, Pendiente 10 %. Closer: Laura o Diego (2 de hoy sin closer). `Monto` 900 o 450 en las Cerradas. Capital/Negocio/Facturacion/Objetivo/Traba/Urgencia/Decisor en el 80 %. `_fuente` `calendly` 60 % (con `CalendlyID` ficticio) y `manual`. `Origen = 'WEBINAR'` en las que cruzan con un registro. `Timestamp` = registro + 1 a 3 días. Las Cerradas llevan `Programa` (el del plan de su venta) y `Fecha cierre = Fecha call`: si no, el filtro por programa de Métricas queda todo en "Sin programa" (R-10) |
| `crm` | Una venta por agenda pasada **Presentada, Cerrada, No-show o Re-agenda** (`presento` Sí, Sí, No y `''`; la Re-agenda con `situacion 'Reagendó'` y la No-show con `'No se presentó'`). **Cancelada y Descalificada no llevan venta**: con `presento` Sí/No, `crmsync` (§7.7.1) las pasaría a No-show o Presentada la primera vez que alguien guarda en Ventas. Las Cerradas con `situacion 'Adentro en Llamada'` y plan de 1 o 2 pagos (450 + 450 a 30 días) armado con `armarCierre` → cuotas en el mes siguiente, una parte `Cobrado`; Presentadas sin cierre con `Seguimiento` o `No cerró`. Dos cuotas del mes anterior sin cobrar (para "traer cuotas"). Cada venta copia de su agenda `agenda` (el id), `nombre`, `telefono`, `mail`, `fecha = Fecha call`, `mes` = el mes de esa fecha, `closer`, `setter` y `fuente = Origen`: con eso "Llamadas sin cargar" (crm.js:69-88) no repite las agendas que ya tienen su venta (R-10) |
| `ajustes/metas` | `{objetivoMes: 15000, cierreGral: 0.25, showUp: 0.6, agendas: 30}` |
| `ajustes/comisiones` · `ajustes/liq` | `{def:10, pct:{'Laura Gómez':12}}` · el mes anterior de Laura pagado |
| `programas` | Programa Insignia 900 (orden 0), Mentoría Grupal 450 (orden 1) |
| `ag-evaluaciones` | 6 evaluaciones de llamadas presentadas de W2 (scores 5–9,5, `por: 'Ana Demo'`) |
| `anun-config/atribucion` | `{tc: 1, origenes: ['MASTERCLASS','WEBINAR']}` |
| `anun-plan` | 4 tarjetas: una por estado (`planificada`, `revision`, `activa`, `pausada`) |
| `anun-audiencias/lookalike` | `{ratio: 0.03, paises: ['CO','MX']}` |
| `utm-links` | 4: Meta automático, Historia IG, Link en bio, Mail |
| `kpis-fijados` | `cap-reg`, `clo-cierre`, `neg-cash` |
| `webinar-asistencia` | W1 `{asistentes:160}`, W2 `{asistentes:210}` |
| `icp-ia/todos` | `{estado:'done', pid:'demo', resultado}` con 3 perfiles cuyos rasgos usan opciones reales de la semilla, una `lectura`, 3 deseos y 3 dolores con frases ficticias |
| `integraciones` | ninguna (todas "Sin conectar"; con `DEMO_META=1`, Meta aparece conectada) |
| `ajustes/semilla` | el manifiesto (ver arriba) |

Coherencia que se cuida: las Cerradas llevan `Monto` = el cash de su venta (`dia1 + seguimiento`), `Programa` y
`Fecha cierre = Fecha call`, así `crmsync {previo:true}` sobre la demo recién cargada da `actualizados: 0`. El ICP
queda correlacionado (compra quien puede invertir y viene por clientes).

Cantidades con `H = 2026-10-27` (1.862 documentos más el manifiesto): personas 5 · webinars 3 · registros 1.700
(650 / 820 / 230; 1.071 contestaron, 412 calificados, 15 personas repetidas de W1 en W2) · agendas 72 (26 de W1,
38 de W2, 8 sin registro; No-show 15, Cerrada 13, Presentada 16, Re-agenda 2, Cancelada 7, Descalificada 3,
Pendiente 10, Confirmada 6) · crm 53 (46 ventas, 13 con plan, y 7 cuotas: 2 cobradas, 2 del mes anterior sin cobrar) ·
programas 2 · ag-evaluaciones 6 · anun-plan 4 · utm-links 4 · kpis-fijados 3 · webinar-asistencia 2 · icp-ia 1 · y los
`ajustes` `negocio`, `estado`, `metas`, `comisiones`, `liq` y `semilla`.

Lo que la semilla **no** borra en una corrida normal: `ajustes/sync-agendas` no está en el manifiesto, así que después
de una corrida de `probar.mjs` (el caso 13 lo deja guardado) hay que recargarla con `--reset` para que el caso 30 vea
`estado: null` (§11.1).

---

## 11. Plan de pruebas

### 11.1 Pruebas de contrato: `scripts/probar.mjs` (P8)

Corre contra un servidor ya levantado y sale con código ≠ 0 si algo falla. Cada caso chequea status y **forma**
(claves y tipos), no valores exactos. Node puro, sin dependencias.

```
node scripts/semilla.mjs --reset      # la demo recién cargada: los casos usan sus códigos e ids, y el 30 la pide así
DEMO_META=1 node scripts/dev.mjs      # en otra terminal, con el mismo SESION_SECRETO que la semilla
node scripts/probar.mjs               # o npm run probar
```

- **Variables:** `BASE_URL` (por defecto `http://localhost:8888`); `BASE_URL_SIN_DEMO` (opcional: otro servidor con la
  misma semilla y **sin** `DEMO_META`; puede compartir `DATOS_DIR`, porque la prueba es secuencial y el driver archivo
  relee los archivos que cambiaron); `DATOS_DIR` (opcional, relativa a la raíz: con ella el caso 40 mira además la
  copia en `crm-borrados.json`).
- **Casos 25 y 26:** el 25 pide un servidor sin `DEMO_META` y el 26 uno con `DEMO_META=1`: no se cumplen los dos contra
  el mismo servidor. Si `BASE_URL` está en demo, el 25 se saltea, salvo que `BASE_URL_SIN_DEMO` apunte al otro; si no
  está en demo, se saltea el 26. Un caso salteado no hace fallar la corrida.
- **Límites por IP:** los casos 3, 21, 22 y 29 y los ingresos mandan una IP inventada en `x-nf-client-connection-ip`,
  que `scripts/dev.mjs` toma como `context.ip` (en Netlify la pisa el borde): una corrida anterior no corta la siguiente.
- **Orden por dependencias, no por número:** el 30 va antes del 13; del 7 al 32 comparten un webinar de prueba; el 12
  va antes del 37; del 16 al 40 comparten una venta de prueba con su agenda.
- **Salida:** por caso `✓|✗|– NN título` y debajo `esperado: … · llegó: …` (o `salteado: …`); al final
  `N pasan · M fallan (n, …) · K salteados (n)`. Exit 1 si falla alguno, si no hay servidor o si no entran `DEMO-EQPO`
  y `DEMO-LAUR`; exit 0 si no falla ninguno.
- **Lo que queda después de una corrida** (por eso, para repetirla, `--reset`): un registro
  `registro-<corrida>@example.com` en el webinar activo (los registros no se borran por la API), la persona de prueba
  dada de baja, `ajustes/sync-agendas` y los contadores de `limites`. Lo demás (agendas, venta y cuota de prueba,
  webinar de prueba, metas, `anun-config/atribucion`, nombres de los programas, el link UTM que borra el caso 42, la
  liquidación de prueba y el webinar activo) vuelve a como estaba; si algo de la limpieza responde mal, lo avisa.
- Para no salir a internet durante la prueba, el servidor se puede levantar con una precarga de `fetch` falso
  (`node --import <fetch-falso>.mjs scripts/dev.mjs`); no va en el repo. El único pedido que intenta salir es el
  `GET` a iClosed del caso 35.

| # | Caso | Esperado |
|---|---|---|
| 1 | Cada endpoint protegido sin cookie | 401 con `error` (y `/api/app inicio` también) |
| 2 | `acceso entrar` con `DEMO-EQPO` en minúsculas y sin guion | 200, `Set-Cookie: mhq_s=…; HttpOnly`, `yo.rol === 'equipo'` |
| 3 | 11 códigos malos seguidos | el 11.º da 429 |
| 4 | `acceso yo` / `salir` / `yo` | 200 / 200 + cookie borrada / 401 |
| 5 | closer (`DEMO-LAUR`) en `registros`, `integraciones`, `personas`, `/api/meta-ads`, `/api/icp`, `/api/tablero`, `adel`, `finanzasget`, `crm borrar`, `/api/db?col=utm-links` | 403 en todos; `webinar`, `GET /api/panel`, `GET /api/crm`, `GET /api/db?col=ag-evaluaciones` → 200 |
| 6 | `inicio` | `yo`, `webinars` array desc, `opciones.vara` con 11 claves, `cliente.moneda/zona` válidos |
| 7 | `webinar` / `proyectar` / `guardarWebinar` (crear, datos con cambio de fecha, proyección, landing) | siempre la Ficha; al mover la fecha +3, todas las `vence` +3; `proyeccion` guardada numérica; preguntas con `id`, `opciones`, `calificadas` |
| 8 | `tarea` (marcar, nueva con bloque vacío, borrar) | `{tareas, progreso}`; bloque `Otras` al final |
| 9 | `GET /api/panel` | `ok:true`, `estados` = 8, `_row === _id` string `[\w-]`, `Fecha call` `YYYY-MM-DD`, `Hora` `HH:MM` o `''` (R-05 y el caso 38 la hacen válida; en la semilla todas tienen hora), `_registro` objeto o null |
| 10 | `POST /api/panel` edit `Monto:'1.500'` | la fila queda `Monto: 1500`; `Estado:'Cerrada'` llena `Fecha cierre` |
| 11 | closer edita una fila de otro | 403 |
| 12 | `add` dos veces la misma (email + fecha + **la misma hora**: con otra hora es otra llamada, §7.4.5) | la segunda `duplicada:true` con el mismo `row`, no hay fila nueva |
| 13 | `agendas-sync` POST sin integraciones | `{cuando, iclosed:{fuente:'iclosed', saltado:true}, calendly:{fuente:'calendly', saltado:true}}`; GET → `{ok:true, estado:{…}}` |
| 14 | `/api/db` `anun-config` `{id:'atribucion', tc:2}` y después `{id:'atribucion', origenes:['X']}` | la 2.ª respuesta trae `tc:2` **y** `origenes`; `webinar-asistencia` con `asistentes:null` pisa; colección `personas` → 403; id con comilla → 400 |
| 15 | `/api/crm` GET | `hoy` = `YYYY-MM`, `yo`, `leaderboard.closers` array ordenado por cash; closer ve solo lo suyo |
| 16 | `crm guardar` con `base` vieja | 409 con `registro` |
| 17 | `crm cierre` con 2 filas (una impaga) | venta con `plan.mensaje`, cuota creada en el mes de vencimiento; segundo cierre → 409 |
| 18 | `crmsync` después de cargar la venta | `actualizados ≥ 1` y la fila del pipeline `Cerrada` con `Monto` |
| 19 | `finanzasget` / `liqpago` / `comisiones` | formas de 7.7; `liqpago` guarda `pct` sin que el cliente lo mande |
| 20 | `/api/publico` | `webinar.inicio` termina en `Z`, sin `calificadas`, `Netlify-CDN-Cache-Control` presente |
| 21 | `/api/registro` paso 1 → paso 2 calificado → `registros` | `nuevo:true`, `ref`, `firma`; paso 2 `calificado:true`, `eventId` termina en `-cr`; el total sube 1; repetir el alta → `nuevo:false` con `ref:''` y `firma:''` (§7.12.1; la prueba solo pide que sean string); honeypot → 200 sin guardar; `GET /api/registro` → 405; firma mala → 403 |
| 22 | `/api/registro` con el webinar terminado | 410 `cerrado`. `--hoy` no sirve para esto (solo corre las fechas de la semilla; el servidor usa el reloj real): se activa W2, que ya pasó, se prueba y se restaura el activo |
| 23 | `/api/icp?w=todos` y `?w=<W2>` | `w` igual al pedido; `utm.dims` con las 3 claves; `ia` presente; `n ≥ agendaron ≥ presentaron ≥ compraron` en cada grupo |
| 24 | `icp-generar-background` sin integración `ia` | 202; al rato `/api/icp` trae `ia.estado:'error'` con el `pid` pedido |
| 25 | `/api/meta-ads` sin `DEMO_META` (servidor aparte: ver arriba) | los 3 modos `{configurado:false, falta:['token','cuenta']}` |
| 26 | `/api/meta-ads` con `DEMO_META=1` (se saltea si el servidor no está en demo) | modo diario con `rango` objeto y `landing.porDia` objeto; `anuncios=1` con `permisos` y `campana` en cada anuncio; `resumen=1` con `gasto` número |
| 27 | `/api/tablero` | `webinars` asc, `registros.porFuente['(sin UTM)']`, `proyeccion.entrada.pctCierre` número |
| 28 | `salud` | `servicios` array con `estado ∈ {ok, mal, pendiente}` |
| 29 | `persona crear` (cliente intenta `equipo`) / `codigo` propio y re-entrar / `baja` a sí mismo | 403 / 200 (con `Set-Cookie` nuevo, §7.3.14) y entrar con el código nuevo funciona, el viejo da 401 / 400 |
| 30 | `agendas-sync` GET con la semilla recién cargada (correr **antes** del caso 13) | `{ok:true, estado:null}` |
| 31 | `activar {id:W2}` y después `activar {id:W3}` | `inicio.webinarActivo` sigue a cada uno; `/api/publico` → `webinar.id` igual (en dev no hay CDN); id inexistente → 404 |
| 32 | `guardarWebinar` crear uno de prueba, `activar` ese, `borrarWebinar` | el activo pasa a otro (§7.3.6); `webinar` con ese id → 404; `webinar-asistencia/<id>` ya no está |
| 33 | `registros {id:W2}` | `total` número, `porDia` objeto, `porFuente['(sin UTM)']` número (la semilla tiene 8 % sin fuente), `envios.ac` y `envios.meta` con `ok`/`mal`, `filas` de la más nueva a la más vieja con `whatsapp` string y `creado` ISO |
| 34 | `integraciones` | exactamente las 6 claves más `ok`; cada `estado ∈ {sin, incompleta, error, ok}`, `falta` array, `clave` vacía o `…xxxx` (nunca una clave entera) |
| 35 | `conectar {cual:'otra'}` / `conectar {cual:'calendly', clave:''}` sin nada guardado / `conectar {cual:'iclosed', clave:'mala'}` | 400 / `400 'Pegá la clave'` / 400 con `error` legible (con o sin red) y `integraciones.iclosed.estado` sigue `sin` |
| 36 | `probar {testCode:'x'}` sin píxel · `probar {salir:true}` · `desconectar {cual:'calendly'}` dos veces | 400 (sin demo, `'Primero elegí el píxel'`; en demo, el 400 del modo demo, §7.3.12: el caso solo pide el 400) · 200 con `detalle` · 200 las dos, con `detalle` |
| 37 | `adel` (equipo) sobre la agenda creada en el caso 12, y otra vez | 200 y la fila ya no sale en `GET /api/panel` / 404 |
| 38 | `add` como el import: `{Nombre:'Prueba CSV', 'Fecha call':<hoy>, Capital:'1500', Hora:'9'}` | 200; la fila queda con `Capital:'1-2K'` y `Hora:''` (R-05) |
| 39 | `guardarWebinar` landing con 3 preguntas; después la misma landing sin la 2.ª | la 3.ª conserva su `id` (R-03) |
| 40 | `crm metas {objetivoMes:20000}` · `crm borrar` de una venta | `GET /api/crm` → `metas` es exactamente `{objetivoMes:20000}` · 200, y en el almacén queda la copia en `crm-borrados` (`/api/db?col=crm-borrados` → 403) |
| 41 | `crm cierre` con una fila sin `fecha` / con `total:0` | 400 `'Revisá la fecha de cada pago'` / 400 `'Poné el precio total'` (R-06) |
| 42 | `/api/db` POST `programas` `{docs:[{nombre:'A'}, {nombre:'a '}]}` · rename cruzado de los dos programas de la semilla en un solo pedido · `DELETE ?col=utm-links&id=<uno de la semilla>` · `DELETE` de un id que no existe | 409 y no se guarda ninguno · 200 · 200 y no está más en el GET · 200 |
| 43 | `/api/meta-ads?desde=2026-10-10&hasta=2026-10-01` con `DEMO_META=1` | `400 {error:'Rango de fechas inválido'}` |
| 44 | `salud` como closer / como equipo | 403 / 200 con "Base de datos" y "Sesiones" en `servicios` |

### 11.2 Pantalla por pantalla (navegador, con la semilla y `DEMO_META=1`)

Criterio: la pantalla pinta datos (no queda en "Cargando…"), **la consola no muestra errores** (solo se aceptan los
`console.warn` propios del frontend) y la pestaña Red no muestra 4xx/5xx salvo los esperados. Repetir las marcadas
con ✱ sin `DEMO_META` (tienen que mostrar "Conectá tu cuenta de Meta" o "sin conectar", sin romper).

| Pantalla (hash) | Rol | Tiene que verse | Llama a |
|---|---|---|---|
| Gate (`/app/`) | — | entra con el código y con el link `/app/#k=DEMO-EQPO`; código malo → texto en rojo; "Salir" estando en `#ceo` recarga y el gate queda **sin** texto en rojo (E-01 + E-40); abrir `/app/#crm` sin sesión, igual; el link `/app/#k=<código>` pegado en la misma pestaña (sin sesión o con la de otra persona) recarga y entra con ese código (E-49) | `acceso entrar`, `yo`, `salir` |
| Inicio `#ceo` ✱ | equipo | saludo, selector de webinar (W3 "en la landing"), tiles de captación con gasto, embudo, alertas "hoy sin closer", KPIs fijados, cargar asistencia | `inicio`, `GET /api/panel`, `/api/tablero`, `meta-ads?resumen=1`, `db webinar-asistencia`, `db kpis-fijados` |
| Ads `#anuncios` ✱ | equipo | las 6 pestañas: Dashboard (KPIs con comparación), Feed, Calendario, Planificar (kanban: mover una tarjeta conserva las demás), Contactos, Audiencias (mapa) | `meta-ads` (3 modos), `db anun-config/anun-plan/anun-audiencias`, `app webinar` |
| UTM's `#utms` · Trazabilidad `#traza` | equipo | grupos por fuente/campaña/anuncio, links guardados (crear y borrar uno), recorridos con medianas | `/api/icp?w=…`, `db utm-links`, `GET /api/panel` |
| ICP `#icp` | equipo | Quién compra, Landing, Agenda. Los perfiles de IA de la semilla están en `icp-ia/todos`: se ven al elegir "Todos los webinars" (el alcance por defecto es W3, sin perfiles: sin la integración `ia` la tarjeta pide cargar la key; con la key conectada diría "Todavía no se armaron" y ofrecería "Armar perfiles"). Sin la integración `ia` la tarjeta pide cargar la key y **no** muestra "Armar perfiles" (icp.js:245-247); el camino sin clave del background se prueba en §11.1 #24 | `/api/icp`, `icp-generar-background` |
| Registros `#registros` | equipo | total (el % del objetivo con un decimal si es menor que 10, como el Inicio: E-50), por día, por fuente, tabla con búsqueda | `app registros` |
| Landing `#landing` | equipo | editor con las preguntas; guardar y ver el cambio en `/` | `app webinar`, `guardarWebinar` |
| Funnel `#embudos` ✱ | equipo | Embudo y Comparador (W1 vs W2) | `/api/tablero`, `meta-ads?resumen=1` |
| Llamadas: Métricas `#closers`, Agendas `#central` (6 etapas), Análisis `#analisis`, Pipeline `#pipeline`, Llamadas `#llamadas`, Pre-call `#precall` | equipo y closer | KPIs por closer, calendario, Sincronizar (toast "sin conectar"), Registrar una llamada, evaluar una llamada (el closer no edita), kanban por estado, tablero del día, ficha del lead con "En la landing" | `GET/POST /api/panel`, `agendas-sync`, `app personas` (no el closer), `app webinar`, `db ag-evaluaciones/ag-config` |
| Ventas `#crm` | equipo y closer | Ventas, Cuotas, Leaderboard; cargar un cierre y copiar el mensaje; "Programas"; closer: solo lo suyo y sin borrar | `/api/crm`, `panel crmsync`, `db programas` |
| Finanzas `#finanzas` ✱ | equipo | Resumen (ROAS con gasto demo), Ventas/cobranza (cobrar una cuota), Liquidaciones (marcar pagado) | `panel finanzasget/liqpago/comisiones`, `/api/crm`, `meta-ads?resumen=1` |
| KPIs `#kpis` | equipo | las 5 pestañas, fijar y desfijar un KPI | `/api/tablero`, `db kpis-fijados`, `meta-ads?resumen=1` |
| Webinar `#webinar` | equipo y closer | ficha, proyección en vivo, checklist (el closer solo mira); crear un webinar nuevo | `inicio`, `webinar`, `proyectar`, `guardarWebinar`, `tarea`, `activar` |
| Integraciones `#conexiones` | equipo | 6 tarjetas "Sin conectar" (o Meta "Modo demo"); conectar con una clave inválida muestra ✗ | `app integraciones/conectar` |
| Equipo `#equipo` | equipo y cliente | lista, crear un closer (código visible una vez), regenerar, dar de baja | `app personas/persona`, `acceso entrar` |
| Tarjeta de salud del menú | equipo | "N conexiones…" (oculta para el closer, que no la pide: sin 403); un solo pedido por carga y ninguno sin sesión (E-47) | `salud` (no el closer) |
| Landing `/` | público | textos de W3, cuenta regresiva, form; registro → paso 2 → `/gracias` | `/api/publico`, `/api/registro` |
| Gracias `/gracias` | público | nombre, pasos (grupo de WhatsApp, calendario `.ics` válido) | `/api/publico` |
| Landing sin webinar activo | público | "No hay una clase abierta en este momento." | `/api/publico` (`webinar:null`) |
| Gracias sin webinar activo | público | entrando directo: "No hay una clase abierta en este momento.", sin barra de progreso ni "No cierres esta página"; con `mhq_nombre` en `sessionStorage` (se registró en esa pestaña): "Tu registro quedó guardado." y el progreso completo (E-53) | `/api/publico` (`webinar:null`) |

**Otra moneda con la semilla.** La semilla guarda `moneda:'USD'` en `ajustes/negocio` (§10), y ese documento pisa a
`NEGOCIO_MONEDA` (§3.2): un servidor con `NEGOCIO_MONEDA=MXN` sobre la demo sigue en USD. Para probar las pantallas en
otra moneda hay que sacar ese campo del documento (o cargar la moneda ahí); el servidor lo ve en hasta 30 segundos,
o al reiniciarlo.

---

## 12. Paquetes de trabajo

Cada paquete es dueño de un conjunto **disjunto** de archivos. Todos programan contra las firmas de §6 y prueban con
`scripts/dev.mjs` + la semilla (el P8 la entrega; mientras tanto, cada uno crea sus datos de prueba a mano).

| Paquete | Archivos | Implementa | Depende de |
|---|---|---|---|
| **P0 · Base** | `package.json`, `.nvmrc`, `.gitignore`, `.env.ejemplo`, `netlify.toml`, `supabase/schema.sql`, `netlify/lib/{http,almacen,almacen-supabase,almacen-archivo,sesion,config,fechas,normalizar,cifrado,telefono}.mjs`, `netlify/lib/integraciones/estado.mjs`, `netlify/functions/{app,panel}.mjs` (despachadores) y los **stubs** de `lib/app/*` y `lib/panel/*`, `scripts/dev.mjs` | §3, §4.1, §5, §6.1-6.10, despacho de 7.3/7.4, servidor local | — (va primero; los demás pueden arrancar con las firmas) |
| **P1 · Acceso y webinars** | `functions/acceso.mjs`, `lib/app/webinars.mjs`, `lib/app/personas.mjs`, `lib/webinars.mjs`, `lib/proyeccion.mjs`, `lib/checklist.mjs`, `lib/landing.mjs` | 7.2 (entrar, yo, salir); 7.3.1-7.3.7 (inicio, webinar, proyectar, guardarWebinar, activar, borrarWebinar, tarea); 7.3.13-14 (personas, persona) | P0 |
| **P2 · Público, registros y envíos** | `functions/{publico,registro,tablero,envios-cron}.mjs`, `lib/app/registros.mjs`, `lib/registros.mjs`, `lib/envios.mjs`, `lib/integraciones/{meta-capi,activecampaign}.mjs` | 7.11, 7.12, 7.13, 7.15, acción `registros` (7.3.8), `probar` de `ac` (para 7.3.10), `eventoPrueba` de CAPI (para 7.3.12) | P0; `webinars`, `proyeccion`, `landing` de P1 (firmas 6.11) |
| **P3 · Agendas y calendarios** | `lib/panel/agendas.mjs`, `lib/pipeline.mjs`, `functions/{agendas-sync,agendas-sync-cron}.mjs`, `lib/integraciones/{calendly,iclosed}.mjs` | 7.4.1-7.4.6 (GET, editar, add, adel), 7.5 (sync GET/POST/cron), `probar` de calendly e iclosed | P0; `registros.cargarRegistros/cruceDe` de P2 |
| **P4 · CRM y finanzas** | `functions/crm.mjs`, `lib/crm-core.mjs`, `lib/panel/finanzas.mjs` | 7.6 (GET, guardar, borrar, cierre, metas), 7.7 (crmsync, finanzasget, liqpago, comisiones) | P0; `pipeline.cargarAgendas/personas` de P3 |
| **P5 · Meta Ads** | `functions/meta-ads.mjs`, `lib/integraciones/meta-ads.mjs`, `lib/atribucion.mjs` | 7.10 (3 modos, errores, caché, demo), `probar` de meta (cuentas y píxeles) | P0; `registros.cargarRegistros` de P2 |
| **P6 · UTM's, ICP e IA** | `functions/{icp,icp-generar-background}.mjs`, `lib/icp-core.mjs`, `lib/integraciones/llm.mjs` | 7.9 completo, `probar` de ia | P0; `registros` (P2), `pipeline.personas` (P3), `webinars` (P1) |
| **P7 · Integraciones, salud y base genérica** | `functions/{db,salud}.mjs`, `lib/app/integraciones.mjs`, `lib/integraciones/fathom.mjs` | 7.8 (`/api/db`), 7.14 (salud), 7.3.9-7.3.12 (integraciones, conectar, desconectar, probar), `probar` de fathom | P0; los `probar(cred)` de P2, P3, P5, P6 (firma 6.11) |
| **P8 · Frontend, semilla, scripts y guía** | las ediciones de §9 en `public/**`, `scripts/{semilla,nuevo-acceso,probar}.mjs`, `README.md` | §9, §10, §11.1; `nuevo-acceso.mjs <nombre> <rol>` (o `--codigo <uid>`, o `--lista`) imprime el código una vez; `README.md` = guía para que un negocio monte su webinar (crear Supabase + correr `schema.sql`, variables, deploy, primer ingreso, integraciones, checklist del webinar) | Todos (la semilla usa `almacen`, `telefono`, `checklist.armarTareas` y `crm-core.armarCierre`) |

Orden sugerido: P0 → (P1, P2, P3, P5, P7 en paralelo) → (P4, P6) → P8 → `probar.mjs` y la revisión pantalla por
pantalla. Definición de terminado para cada paquete: sus casos de §11.1 en verde y sus pantallas de §11.2 sin errores.

---

## 13. Preguntas abiertas y valores por defecto elegidos

Lo que el frontend no puede decir. Cada fila tiene la decisión tomada (se implementa así) y dónde está en el contrato.

### Núcleo, sesión y roles

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿El closer ve todas las agendas o solo las suyas? | Lee todas (métricas y leaderboard las necesitan); edita solo las suyas o sin closer, y pocos campos (§5.5) |
| 2 | ¿El closer ve los registros del CRM de otros? | No: solo los suyos; el leaderboard sí es de todos (§5.5, 7.6.1) |
| 3 | ¿`salud` entra en la plantilla? | Sí, con la tarjeta del menú (E-02, E-03, 7.14) |
| 4 | ¿`/api/db` con id: merge o reemplazo? | Merge superficial; `null` pisa; devuelve el doc completo (7.8) |
| 5 | ¿Códigos sin distinguir mayúsculas? ¿Primer usuario? | Sí, se normalizan (§5.1); primer usuario con `CODIGO_INICIAL` (§5.3) |
| 6 | ¿Nombre del negocio en el gate antes de entrar? | No: queda "Masterclass HQ" (nombre del producto). Se podría leer de `/api/publico` en una versión futura |
| 7 | ¿Fechas en UTC o locales? | El servidor manda días y horas locales de la zona del negocio (`Fecha call`, `Hora`, `dia`, `porDia`, `hoy`); los instantes van en ISO UTC (`Timestamp`, `creado`) |
| 8 | ¿Se puede tocar el frontend? | Solo lo de §9 |
| 9 | ¿`equipo` y `cliente` difieren? | Solo en Equipo: `cliente` no crea ni toca personas `equipo` |
| 10 | Formato y largo del código | `XXXX-XXXX`; regenerar el propio cierra las otras sesiones, la respuesta trae la cookie nueva y el frontend igual vuelve a entrar solo (§7.3.14) |

### Webinar, landing y registros

| # | Pregunta | Decisión |
|---|---|---|
| 11 | Checklist "fases 0 a 7" | Plantilla propia y genérica de 8 bloques (7.3.7). No se copia ningún SOP con derechos de autor |
| 12 | `formatos`, `cierres` y `vara` | Valores genéricos de §6.4, pisables en `ajustes/negocio` |
| 13 | Defaults de un webinar nuevo | ventana 10, etiqueta `webinar-<fecha>`, `duracionMin` 180, landing copiada del webinar activo (o la de defecto) |
| 14 | ¿Cómo queda estable el `id` de una pregunta al editar el texto? | Se conserva el id de la pregunta en la misma posición; las nuevas usan el slug del texto |
| 15 | Borrar el webinar activo | Pasa a activo el próximo con fecha futura, si no el más reciente, si no `null` (`/api/publico` → `webinar:null`) |
| 16 | Etiqueta de los registros sin `utm_source` | `'(sin UTM)'` en `registros.porFuente` y en `tablero` |
| 17 | ¿Qué evento de Meta reciben los no calificados? ¿Alcanza `ads_read` para la CAPI? | Todos reciben `Lead`; solo los calificados, además, `CompleteRegistration`. Para la CAPI hace falta que el usuario del sistema tenga el píxel asignado (o `META_CAPI_TOKEN`); `ads_read` solo alcanza para leer |
| 18 | `conectar` que falla | Clave nueva: no se guarda. Clave reusada: queda `estado:'error'` |
| 19 | ¿`registros` pagina? | No: devuelve todas las filas del webinar con pocos campos (≈ 300 bytes cada una; 6 MB alcanzan para ~20.000) |
| 20 | ¿`cliente` maneja integraciones y equipo? | Sí (ve todas las pantallas) |
| 21 | Dedupe del registro | Mismo email o mismo WhatsApp (E.164) dentro del mismo webinar; el duplicado no cambia nada y responde `nuevo:false` con `ref:''` y `firma:''` |
| 22 | Ninguna pregunta con opciones marcadas | `calificado: null` |
| 23 | ¿El paso 2 se puede reenviar? | No: una sola vez (409, que el navegador ignora) |
| 24 | ¿Desde cuándo está "cerrado"? | `ahora > inicio + duracionMin` (la del webinar; si no tiene, la del negocio; por defecto 180 min, igual que la landing; `duracionDe`, §6.11) |
| 25 | ¿`/api/publico` publica `calificadas`? | No |
| 26 | Formato del id del webinar | `w` + AAAAMMDD + 4 `[a-z0-9]` |
| 27 | Validación de teléfonos | Tabla liviana de largos por país (§6.7), sin libphonenumber |
| 28 | Rotación de grupos de WhatsApp | No: un link que se cambia a mano |
| 29 | `eventId` del CompleteRegistration | `eventId + '-cr'` |
| 30 | `og:*` y `<title>` del lado del servidor | No en esta versión (anotado para una edge function futura) |
| 31 | ¿Gracias sabe a qué webinar se anotó la persona? | No: muestra el activo (sin cambios en el frontend) |
| 32 | Duración de la clase (3 h en la landing, 2 h en el calendario) | Un solo campo `duracionMin` (E-29, E-30) |

### Agendas, CRM y finanzas

| # | Pregunta | Decisión |
|---|---|---|
| 33 | `_row` | String estable `ag_…`, igual a `_id` |
| 34 | `Monto` crudo desde la tabla | El servidor lo normaliza a número |
| 35 | `Timestamp` en UTC sin `T` del alta manual | Se ignora y se guarda el ISO del servidor |
| 36 | Mapeo del form de iClosed/Calendly a Negocio, Capital, etc. | `opciones.mapeoForm` por palabras clave, configurable en `ajustes/negocio`; gana la palabra que aparece **primero** en la pregunta (empate: el orden de la lista), así «¿Cuánto factura tu negocio?» es `Facturacion` (§7.5.4) |
| 37 | Tramos de capital, orígenes y mensaje de WhatsApp configurables | Quedan fijos en el frontend; el servidor solo normaliza a los tramos (`capitalTramos`) |
| 38 | `addMany` para el import | No: 100 `add` en serie, con dedupe del servidor |
| 39 | Intervalo del sync | 15 min (programada) |
| 40 | ¿Cómo detectar una llamada cancelada en iClosed? | **FALTA confirmar** con la documentación de iClosed: hoy se busca `cancel` en `status`, `callStatus` u `outcome` |
| 41 | Fórmulas de `aovD1`, `aovTrato`, `cashTrato` | 7.6.1 (AOV día 1 sobre unidades + fees; AOV trato sobre unidades) |
| 42 | ¿`metas` por mes o globales? | Globales (el pedido `metas` no trae mes) |
| 43 | Reparto de `dia1` y `seguimiento` en el cierre | Fila 0 → `dia1` (salvo "Adentro en Seguimiento"); las otras pagadas → `seguimiento`; las impagas → cuotas (7.6.4) |
| 44 | ¿El cierre rechaza Σ montos ≠ total o un segundo cierre? | La diferencia se acepta y se guarda; el segundo cierre → 409 |
| 45 | `crmsync`: ¿qué `Monto` escribe? ¿`Programa`? | El cash cobrado (`dia1 + seguimiento` + copias); sí escribe `Programa` |
| 46 | Situación de cuota "Protocolo" | Se saca de la lista por defecto |
| 47 | Modelo de almacenamiento del CRM | Una colección `crm` con campo `mes` |
| 48 | ¿`finanzasget` limita meses? | Últimos 36 |
| 49 | Moneda del CRM y de Finanzas | `cliente.moneda` (E-26, E-27) |
| 50 | Copias duplicadas (`de`) | El servidor devuelve la existente en vez de crear otra |

### Ads, UTM's e ICP

| # | Pregunta | Decisión |
|---|---|---|
| 51 | `tipoResultado` con 0 resultados | Por el objetivo de la campaña (7.10.4) |
| 52 | ¿Anuncios sin gasto en `anuncios=1`? | Sí, los creados dentro del rango (para "lanzamientos" del calendario) |
| 53 | ¿Todas las campañas en `campanas`? | Todas las no borradas |
| 54 | Zona horaria de Meta contra la del negocio | Cada una la suya; al conectar Meta, si la zona de la cuenta es distinta, `detalle` lo avisa ("· la cuenta usa <zona>") |
| 55 | Precedencia de UTM en la atribución | `utm_content` contra anuncios, después contra campañas, después `utm_campaign` (7.10.5) |
| 56 | Claves de `permisos` | `ads_read` y `ads_management` (booleanos) |
| 57 | Mapa del mundo desde un CDN | Se deja; copiarlo a `public/app/vendor/` es opcional (E-35) |
| 58 | Rangos de hasta un año con datos diarios por anuncio | Se aceptan (≤ 400 días), con paginación de Meta y caché de 5 min |
| 59 | ¿`recorridos` cubre todo el pipeline? | Sí |
| 60 | "todos" con varios registros por persona | Se usa el más reciente; `n` cuenta personas |
| 61 | `agendaron` con agendas anteriores al registro | Cuentan (el frontend las excluye solo de la mediana) |
| 62 | Cruce por WhatsApp | Últimos 8 dígitos (`tel8`) o email en minúsculas |
| 63 | `sinRegistro.agendas` | Cuenta personas |
| 64 | Preguntas de landing con "todos" | Unión por `id` |
| 65 | Universo para contar perfiles de IA | Registros del alcance ∪ personas del pipeline sin registro (7.9.1) |
| 66 | Modelo y formato del ICP con IA | `claude-opus-5-5`, salida JSON con esquema (§8.6) |
| 67 | `ia` por alcance | Sí: un doc por webinar y uno para `todos` |
| 68 | `ctx` de cada grupo UTM | Fuente dominante para campaña; campaña dominante para anuncio |
| 69 | `CAMPOS_AGENDA` | Fijos en el frontend (icp.js:28); el servidor usa la misma lista (`camposAgenda`) |
| 70 | ¿`/api/tablero` para closers? | 403 |
| 71 | Fathom `/teams` | Se usa `GET /external/v1/teams`; **verificar** la forma de la respuesta en la primera conexión real |
| 72 | ¿`/ads` y `/campaigns` traen los anuncios y campañas archivados o borrados? | Se piden con `effective_status` explícito (sin `DELETED`, con `ARCHIVED`) y los anuncios con entrega que falten se completan con `GET /?ids=` (§8.1). **Verificar en la primera conexión real:** qué devuelven `/ads` y `/campaigns` con ese filtro (y sin él), y que `GET /?ids=` lea anuncios borrados |

### Fuera de la plantilla (avisar al dueño del sitio vivo, no copiar)

En la configuración publicada de donde se descargó el frontend: `landing.whatsapp` está vacío aunque la FAQ y el
microcopy prometen el acceso por WhatsApp; `presentador.bio` muestra en público un texto interno entre corchetes; y
`pixel` es `null` (la landing no mide nada en Meta). Nada de eso pasa a la semilla.

---

## 14. Revisión de completitud (27/10/2026)

Revisión hecha contra el frontend y no contra los análisis. Se buscaron con grep en `public/` todos los `fetch(`,
`pedirJSON(`, `api(`, `apiApp(`, `apiAcceso(`, `dbLista/dbGuardar/dbGuardarVarios/dbBorrar(`, los envoltorios propios
(`pedir` de crm.js y ads.js, `pedirCrm` de finanzas.js), cada `accion:`/`action:`, cada query string y los campos que se
leen de `DATA`, `window.MHQ`, `YO` y de cada respuesta.

### 14.1 Inventario verificado (ya estaba en el contrato)

| Qué | Encontrado en el frontend | Dónde está en el contrato |
|---|---|---|
| Endpoints | `/api/acceso`, `/api/app`, `/api/panel`, `/api/db`, `/api/crm`, `/api/meta-ads`, `/api/icp`, `/api/tablero`, `/api/agendas-sync`, `/.netlify/functions/salud`, `/.netlify/functions/icp-generar-background`, `/api/publico` (también como `<link rel="preload">` en index.html:11 y gracias.html:10), `/api/registro` | §7.2 a §7.15 |
| `apiAcceso` | `entrar`, `yo`, `salir` | §7.2 |
| `apiApp` | `inicio`, `webinar`, `proyectar`, `guardarWebinar` (4 usos), `activar`, `borrarWebinar`, `tarea` (3 usos), `registros`, `integraciones`, `conectar`, `desconectar`, `probar` (2 usos), `personas`, `persona` (3 usos) | §7.3 |
| `/api/panel` | `GET`; `{row, field, value}` con `field` ∈ `Estado, Monto, Gatillo, Notas, Closer` (son los únicos que manda la UI); `action` ∈ `add, adel, crmsync, finanzasget, liqpago, comisiones` | §7.4, §7.7 |
| `/api/crm` | `GET ?mes=&t=`; `accion` ∈ `guardar, borrar, cierre, metas`; el 409 con `registro` | §7.6 |
| `/api/meta-ads` | `?desde&hasta&diario=1` (ads.js:183), `?anuncios=1&desde&hasta` (ads.js:203), `?resumen=1&desde&hasta` (inicio.js:221, finanzas.js:126; KPIs y Funnel por `TAB.gasto`) | §7.10 |
| `/api/icp` | `?w=<id\|todos>` (utms.js:104, icp.js:61); background `?w=&pid=` con `POST` sin cuerpo (icp.js:311) | §7.9 |
| `/api/db` | `ag-evaluaciones`, `ag-config`, `anun-plan`, `anun-config`, `anun-audiencias`, `utm-links`, `kpis-fijados`, `webinar-asistencia`, `programas` (GET, POST `doc`, POST `docs`, DELETE) | §4.4, §7.8 |
| Campos de `DATA.rows` | `_row, _id, _registro{w, utm, respuestas, calificado, creado}, _fuente`, `Nombre, WhatsApp, Email, Instagram, Fecha call, Hora, Estado, Closer, Setter, Monto, Programa, Fecha cierre, Gatillo, Notas, Capital, Origen, Evento, Timestamp, CalendlyID, Negocio, Facturacion, Objetivo, Traba, Urgencia, Decisor`; `DATA.ok`, `DATA.estados` | §4.3, §7.4.1 |
| `window.MHQ` | `cliente.{nombre, color, moneda, zona, prefijoTel}` (desde E-43, mhq.js lee además `cliente.horaPorDefecto` de su copia de `inicio`), `webinars[].{id, nombre, fecha, hora, popup}`, `webinarActivo`, `metaPrueba`, `opciones.{formatos, cierres, vara, roles}`, `yo.{uid, rol}` | §7.3.1 |
| `YO` | `nombre`, `rol` (la visibilidad sale de `PERFILVIEWS`, no de `yo.pantallas`) | §7.2 |
| Vistas | las 20 `section.view` de app/index.html:90-109 | todas en §11.2 |
| Roles | `equipo` = `cliente` = las 20 vistas; `closer` = `closers, central, analisis, pipeline, llamadas, precall, crm, webinar` (base.js:53-61). Lo que piden las vistas del closer (`GET/POST /api/panel`, `agendas-sync`, `app inicio/webinar/proyectar`, `GET /api/crm` + `guardar/cierre`, `crmsync`, `GET /api/db` de `ag-evaluaciones`/`ag-config`) es `T` en §5.4; lo demás que la UI le puede disparar (`adel`, `personas`, escribir evaluaciones) es `E/C` y da 403 sin cerrar la sesión | §5.4, §5.5 |
| Landing pública | `GET /api/publico` → `cliente`, `pixel`, `webinar.{id, inicio, landing, duracionMin, pais}`; `POST /api/registro` paso 1 (`error` ∈ `nombre, email, whatsapp, demasiados, cerrado`) y paso 2; gracias lee `landing.{whatsapp, pasoMail, video, disclaimer, titulo}` | §7.11, §7.12 |

### 14.2 Huecos que se llenaron

| # | Hueco | Qué se agregó |
|---|---|---|
| R-01 | El `.gitignore` que ya existe en el repo tiene `.env.*` con la excepción `!.env.example`, pero el archivo de ejemplo del contrato se llama `.env.ejemplo`, así que nunca se commitea. Además `_analisis/` no estaba excluido y trae datos reales del sitio original (nombre del dueño, copy, precios y el criterio de calificación en US$, sobre todo 10-publico.md) | §2: la línea de `.gitignore` con su contenido exacto (`!.env.ejemplo`, `_analisis/`). P0 reescribe el archivo |
| R-02 | Faltaba el estado vacío explícito de varias respuestas | §14.3 |
| R-03 | El `id` de una pregunta se heredaba por posición, pero el editor manda solo las preguntas con texto: al vaciar la del medio, la tercera tomaba el `id` (y las respuestas viejas) de la segunda | §7.3.4: primero por texto igual, después por posición si la cantidad no cambió, después `slug` |
| R-04 | No decía que los `id` de `opciones` y las selecciones guardadas son strings (el modal compara con `===`) ni que las opciones se pierden al recargar | §7.3.10 |
| R-05 | El `add` aplicaba la validación estricta de la edición: un CSV con `Capital: 1500` o `Hora: 9` daba 400 y cortaba el import en esa fila | §7.4.5: en el alta solo `Nombre` y `Fecha call` dan 400; el resto se normaliza (`capitalTramo`, `''`) |
| R-06 | `cierre` no tenía los mensajes de `total`, cantidad de filas, monto y fecha | §7.6.4 |
| R-07 | Unicidad de `programas` en un `POST {docs}` (la UI guarda la lista entera de una vez) | §7.8: se mide sobre el resultado, todo o nada |
| R-08 | `probar` con un `testCode` inválido (el input puede ir vacío) no tenía mensaje | §7.3.12 |
| R-09 | Restos del sitio original y detalles del frontend que no estaban en §9: la hora fija de Argentina en finanzas.js:40; un selector con el apodo de una persona en dos CSS; "USD" fijo en los tramos de capital; "SOP" en los textos de la checklist; el gate que le muestra "Tu sesión se cerró" a quien nunca entró (pasa siempre después de E-01, porque la recarga conserva el hash y shell.js pinta la pantalla antes del ingreso); la lista de closers de Equipo que no se reintenta; el checkbox de una tarea que no vuelve atrás si falla | §9.5: E-36 a E-42 (E-38, E-39, E-41 y E-42 opcionales) |
| R-10 | La semilla no decía que las agendas Cerradas llevan `Programa`, ni que cada venta del CRM apunta a su agenda (`agenda`, `fecha`, `mes`, `closer`…) | §10 |
| R-11 | El plan de pruebas no cubría `activar`, `borrarWebinar`, la forma de `registros` e `integraciones`, `conectar`/`probar`/`desconectar` con datos malos, `adel`, el alta tolerante, el `id` estable de las preguntas, `metas`/`borrar` del CRM, los errores del cierre, `programas` en lote, `DELETE` de `/api/db`, el rango inválido de Meta, `agendas-sync` antes de la primera corrida ni `salud` por rol. Y la fila del ICP prometía un "error legible" que la UI no puede mostrar (sin clave no hay botón), con los perfiles de la semilla en un alcance que no es el de por defecto | §11.1 casos 30 a 44; §11.2 filas Gate e ICP |
| R-12 | Faltaba la verificación final de sanitización de lo que se publica | §14.4 |

### 14.3 Estados vacíos (sin datos, sin conectar)

| Pedido | Respuesta cuando no hay nada |
|---|---|
| `app inicio` | `webinars: []`, `webinarActivo: null`, `metaPrueba: false`; `cliente` y `opciones` completos (mhq.js muestra "El primer webinar") |
| `app registros` (webinar sin registros) | `{total:0, porDia:{}, porFuente:{}, calificados:0, respondieron:0, envios:{ac:{ok:0, mal:0}, meta:{ok:0, mal:0}}, filas:[]}` |
| `app personas` | nunca vacío: al menos quien pregunta |
| `GET /api/panel` | `{ok:true, estados:[las 8], rows:[]}` (con `ok:true`: si no, Ads y Contactos se quedan en "Cargando las agendas…") |
| `GET /api/agendas-sync` | `{ok:true, estado:null}` |
| `GET /api/crm` | `registros: []`, `programas: []`, `closers` = las personas activas con rol closer (puede ser `[]`), `leaderboard: {closers:[], equipo:{}, metas:<ajustes/metas o {}>, cuotas:0, total:0}`, `metas: {}` |
| `panel finanzasget` | `{meses:{}, metas:{}, comisiones:{def:10, pct:{}}, liq:{}}` |
| `GET /api/db` | `{ok:true, docs:[]}` |
| `GET /api/icp` | `utm.totales` en ceros; `utm.dims` con las tres claves en `[]`; `combos: []`; `sinRegistro: {agendas:0, ventas:0, cash:0}`; `recorridos: []`; `montos: {}`; `icp.base.registros` en ceros e `icp.base.pipeline: {n:0, compraron:0, cash:0}`; `icp.landing` = las preguntas del webinar con todas sus opciones en 0 (`[]` si el webinar no tiene preguntas o el id no existe); `icp.agenda: []`; `icp.texto: {}`; `ia: {hayKey, estado:'', pid:'', error:'', resultado:null}` |
| `GET /api/tablero` | `{ok:true, webinarActivo:null, webinars:[]}`; un webinar sin registros lleva `registros:{total:0, calificados:0, respondieron:0, porFuente:{}, porDia:{}}` y su `proyeccion` calculada con la vara |
| `GET /api/meta-ads` (los 3 modos) | sin token o sin cuenta: `{ok:true, configurado:false, falta:[…]}` |
| `salud` | siempre "Base de datos" y "Sesiones". "Calendarios" solo si `iclosed` o `calendly` están conectadas, y "Envíos de registros" solo si `ac` o el píxel de `meta` lo están: con nada conectado la tarjeta dice "2 conexiones, todas bien" y no un "pendiente" eterno (esto precisa la tabla de §7.14) |
| `GET /api/publico` | `webinar: null` con `cliente` y `pixel` (la landing muestra "No hay una clase abierta en este momento.") |

### 14.4 Sanitización: verificación final

Antes de publicar el repo, P8 corre este grep desde la raíz, sobre `public/`, `netlify/`, `scripts/`, `supabase/` y los
tres documentos que van al repo, `SPEC.md`, `GUIA-WEBINAR.md` y `README.md` (si alguno todavía no existe, grep lo
avisa y sigue):

```
grep -rniE "alex|carrera|exposure|tincho|nexum|productos digitales|bm-hub|bmkey|bmper|\bBM\b|ATLAS|di zeo|agencia de ia|ia partner|4\.000|12-ago|act_[0-9]|\b[0-9]{15,16}\b" public netlify scripts supabase SPEC.md GUIA-WEBINAR.md README.md
```

Resultado esperado: solo tokens técnicos, que no son de nadie: los nombres de archivo `ui-atlas.js` y `atlas.css`, la
librería `world-atlas` del mapa, la marca `window.__uiAtlas` de `ui-atlas.js` y el falso positivo `scaleX` (una
función de CSS en `componentes.css`, que tiene adentro las letras de uno de los nombres buscados). En `SPEC.md` aparece
además la línea de este mismo grep, que tiene que nombrar lo que busca. Cualquier otra coincidencia se corrige antes de
publicar.

`CREDITOS.md` queda **afuera del grep a propósito**: es el único archivo que nombra al autor del frontend original, que
es justamente lo que tiene que decir.

El grep de esta revisión no encontró teléfonos, mails, dominios propios ni ids de cuenta publicitaria o de píxel en el
frontend: lo del negocio original estaba en comentarios, placeholders y textos (cubiertos por E-04 a E-42) y en los
datos publicados del sitio vivo, que no se copian. `SPEC.md` tampoco los nombra: en §9, la columna «Antes» describe lo
que había (p. ej. «el producto del negocio original», «el apodo de una persona») en vez de copiarlo, y en el resto del
documento se habla del negocio original, el sitio original o el equipo que hizo el frontend original, sin nombres. Los
ejemplos de ids de Meta usan números cortos o `act_<n>`. `_analisis/` y `_original/` quedan fuera del repo (R-01).

### 14.5 Lo que esta revisión no pudo resolver

| Tema | Por qué | Qué se hace mientras |
|---|---|---|
| Cómo marca iClosed una llamada cancelada | No hay documentación pública a mano (§13 #40) | Se busca `cancel` en `status`, `callStatus` u `outcome`; confirmarlo con una cuenta real |
| La forma de la respuesta de `GET /external/v1/teams` de Fathom | Ídem (§13 #71) | `probar` acepta `items[]` o un array; verificar en la primera conexión |
| La conciliación del pipeline solo corre cuando el CRM cambia `presento`, `dia1`, `seguimiento` o `agenda`, o después de un cierre (crm.js:408, 596) | Es una decisión del frontend: cambiar solo `situacion` (por ejemplo a "No cerró") no la dispara | Se acepta. Si hace falta, el cron de agendas puede correr `crmsync({previo:false})` después de sincronizar (no está en este contrato) |
| Reordenar tarjetas dentro de la misma columna de Planificar no se guarda (ads.js:1192 sale antes) | Bug del frontend, fuera del backend | Se deja; el orden entre columnas sí se guarda |
| La FAQ automática "¿A qué hora es en mi país?" usa Argentina como día de referencia y la etiqueta "Miami" (comun.js:69-78) | Es copy fijo del frontend y §9 decide no tocarlo | Se deja |
| Vista previa del link en WhatsApp y Facebook (`og:*`) | Necesita reescribir el HTML del lado del servidor (§13 #30) | Fuera de esta versión |
| **Tamaño de las respuestas sin paginar** (límite conocido) | Una función sincrónica de Netlify no puede responder más de 6 MB (§1.2). `GET /api/panel` devuelve todo el pipeline: unos 935 B por agenda (929 medidos con la semilla; las de calendario con el form completo pesan más), así que **sin comprimir** pasa los 6 MB cerca de las **6.700 agendas**. Desde los 4 MB sale con gzip si el pedido lo acepta (§7.4.1; 6.000 agendas ≈ 130 KB), lo que aleja el corte, pero sin `Accept-Encoding: gzip` se corta igual. `/api/icp` no comprime: lo que crece es un recorrido por persona del pipeline (≈ 260 B en la semilla) y llega a los 6 MB cerca de las **17.900 personas** | Si un negocio se acerca: archivar las agendas viejas (sacarlas de `agendas` a otra colección) o, en una versión futura, paginar `GET /api/panel` y `/api/icp` (el frontend hoy espera todo junto) |
| Meta: archivados y borrados en `/ads` y `/campaigns` | Sin cuenta real para probar (§13 #72) | `effective_status` explícito + `GET /?ids=` para los que falten; verificar en la primera conexión |
| `creado` de la semilla con Supabase | La fachada no deja fijar `creado` (lo pone la base) | Con Supabase, registros y evaluaciones de la demo quedan con la fecha de la carga (§10). Si hace falta, una opción `{creado}` en `guardar`/`fusionarVarios` para importaciones (en Supabase, mandar `creado` en el upsert) |
| `mhq_fusionar_si` con conexiones concurrentes reales | Se probó con el `schema.sql` real en Postgres embebido (PGlite) detrás de un PostgREST falso, que tiene una sola conexión: el `FOR UPDATE` con varias conexiones a la vez no se pudo ejercitar | Es la semántica estándar de `READ COMMITTED` (el segundo `SELECT … FOR UPDATE` espera el candado de la fila y lee la versión ya escrita, así que la condición se mira sobre lo nuevo); confirmarlo en el primer Supabase real |

---

## 15. Cambios después de la implementación (27/10/2026)

Registro corto de lo que cambió respecto de la primera versión del contrato al ponerlo al día con el código. El
detalle está en el cuerpo: cada línea lleva el link a su sección.

**Almacén y base**

- Primitivas `fusionarSi` (compare-and-set: fusiona solo si el documento existe y cumple la condición) y
  `fusionarVariosSiExisten` (actualiza solo los que existen), con sus RPC `mhq_fusionar_si` y
  `mhq_fusionar_varios_si_existen`; un Supabase ya creado vuelve a correr `schema.sql` antes de desplegar →
  [§4.1](#41-la-tabla) · [§6.2](#62-netlifylibalmacenmjs-fachada-y-drivers)
- `ALMACEN=archivo` desplegado en Netlify: cada pedido da 500 «Falta configurar Supabase…»; sin `SUPABASE_URL`, el
  driver Supabase da un 500 legible → [D14](#11-arquitectura-decidida-acá-solo-se-precisa) · [§3.1](#31-núcleo) ·
  [§6.2](#62-netlifylibalmacenmjs-fachada-y-drivers)
- Lo que valida la fachada antes del driver, el orden de las RPC de varios y el bloque SQL completo →
  [§6.2](#62-netlifylibalmacenmjs-fachada-y-drivers) · [§4.1](#41-la-tabla)
- `.gitignore` ignora `.datos*/` → [§2](#2-estructura-del-repo)

**Sesión y acceso**

- El primer ingreso va de a uno: candado `ajustes/arranque` con `fusionarSi` (vence a los 2 min) además del de
  `limites` → [§5.3](#53-arranque-el-primer-usuario) · [§4.3](#43-colecciones-internas-reservadas-apidb-responde-403-si-se-las-pide)
- Con la IP cortada por el límite, entra quien ya tiene sesión y pone su propio código → [§5.1](#51-códigos-de-acceso)
- `entrar` escribe `ultimoIngreso` con `fusionarSi`: si la persona se borró en el medio, 401 →
  [§7.2](#72-netlifyfunctionsaccesomjs--apiacceso-p1)
- `Secure` también con `x-forwarded-proto: https`; la sesión pide un rol válido → [§5.2](#52-cookie-de-sesión)
- Regenerar el código propio responde con `Set-Cookie`; `personas` y `webinars` llevan `v` (bloqueo optimista, 409) →
  [§7.3.14](#7314-persona-ec) · [§7.3.5](#735-guardarwebinar-ec) · [§4.3](#43-colecciones-internas-reservadas-apidb-responde-403-si-se-las-pide)

**Librería compartida**

- `fechas.mjs`: `diaLocal`, `horaLocal`, `sumarDias`, `mesSig` y `difDias` dan `null` con datos inválidos; `aUTC`
  sigue tirando → [§6.5](#65-netlifylibfechasmjs)
- `normalizar.mjs`: con valores que no son simples, `texto` y `norm` dan `''` y `monto` da `null` →
  [§6.6](#66-netlifylibnormalizarmjs)
- `config.mjs`: la `vara` se lee con `monto()`; en `mapeoForm`, `Facturacion` va antes que `Negocio`; `enNetlify()`;
  validación de cada campo de `negocio()` → [§6.4](#64-netlifylibconfigmjs)
- `http`, `sesion`, `telefono`, `cifrado` e `integraciones/estado`: lo que faltaba → [§6.1](#61-netlifylibhttpmjs) ·
  [§6.3](#63-netlifylibsesionmjs) · [§6.7](#67-netlifylibtelefonomjs) · [§6.8](#68-netlifylibcifradomjs) ·
  [§6.9](#69-netlifylibintegracionesestadomjs)
- Despachadores: los nombres `__` no se piden, `ok` va al final →
  [§6.10](#610-despachadores-appmjs-y-panelmjs-p0-y-contrato-de-los-módulos-de-acciones)
- Firmas puestas al día (`duracionDe(w, neg)`, `terminado(w, zonaONeg)`, `vistaPublica`, `completarLanding`,
  `preguntasDe`, `enParalelo`, `BORRADAS`, `repartir`, el `traer` de cada calendario, las ayudas de `crm-core` e
  `icp-core`, `VIVOS_DEMO` y `ANUNCIOS_DEMO`) → [§6.11](#611-firmas-entre-paquetes-para-programar-en-paralelo)
- `scripts/dev.mjs`: una cookie con `%` roto no tumba nada, `context.ip` sale del header, `.env` no pisa el entorno →
  [§6.12](#612-scriptsdevmjs-p0)

**Endpoints**

- `inicio` trae `cliente.horaPorDefecto` → [§7.3.1](#731-inicio-t--libappwebinarsmjs)
- La ficha, `/api/publico` y `/api/registro` dan la misma duración; `guardarWebinar` acepta `duracionMin` →
  [§7.3.2](#732-webinar-t) · [§7.3.5](#735-guardarwebinar-ec) · [§7.11](#711-apipublico--la-landing-pública-p2)
- La proyección redondea las cantidades en cada paso (el cash sale de las ventas que se ven) →
  [§7.3.3](#733-proyectar-t-y-la-proyección)
- `/api/registro` paso 2 escribe con `fusionarSi`: un registro borrado en el medio no se recrea (404) →
  [§7.12.2](#7122-paso-2-pasorespuestas)
- Proyección, landing y checklist: cómo se leen los números, el `id` de las preguntas, el orden de las tareas →
  [§7.3.3](#733-proyectar-t-y-la-proyección) · [§7.3.4](#734-la-landing-guardada-y-su-parseo) · [§7.3.7](#737-tarea-ec)
- `conectar`: etiquetas de AC solo si cambió la cuenta, validación de selecciones, `testCode` que se va con el píxel;
  en modo demo, `conectar meta` y `probar {testCode}` dan 400 → [§7.3.10](#7310-conectar-ec) ·
  [§7.3.12](#7312-probar--modo-prueba-del-píxel-ec)
- `desconectar` devuelve `detalle` → [§7.3.11](#7311-desconectar-ec)
- `persona`: el rollback de una reactivación va con `fusionarSi` → [§7.3.14](#7314-persona-ec)
- `GET /api/panel` sale con gzip desde los 4 MB → [§7.4.1](#741-get-apipanel-t--agendasacciones__listar)
- Editar una agenda va con `fusionarSi`, con la condición de `Closer`: 404, «Otro closer la tomó recién» y «La agenda
  cambió mientras guardabas» → [§7.4.4](#744-post-apipanel-row-field-value-t--agendasacciones__editar)
- `add`: dedupe con la misma hora, completar con condición, id fijo, cualquier `Closer` →
  [§7.4.5](#745-post-apipanel-actionadd--t--alta-manual-e-importación)
- `adel` anota el `fuenteId` y el sync no la recrea → [§7.4.6](#746-post-apipanel-actionadel-row-ec)
- Sync: `SI_VACIO` con `deFuente`, cancelación una sola vez, `mapeoForm` por la palabra que aparece primero y escritura
  condicionada (la cancelación solo si sigue cancelable, `SI_VACIO` solo si sigue vacío, nunca recrea una borrada) →
  [§7.5.4](#754-algoritmo-de-sincronizar-por-fuente-dentro-del-presupuesto-de-tiempo)
- CRM: un nombre por closer, ids fijos de copias y cuotas, el cierre que vuelve atrás si fallan las cuotas →
  [§7.6.1](#761-get-apicrmmesyyyy-mmtms-t) · [§7.6.2](#762-post-accionguardar-registro-base-t) ·
  [§7.6.4](#764-post-accioncierre-id-mes-plan-t--armarcierre)
- `crmsync`: por nombre o teléfono solo filas del closer de la venta; `Presentada` y `No-show` condicionados al
  `Estado` leído; `actualizados` = filas escritas → [§7.7.1](#771-actioncrmsync-previoboolean-t)
- `liqpago` con versión y 409 → [§7.7.3](#773-actionliqpago-mes-closer-pagomonto-fechanull-ec)
- `/api/db`: tamaños medidos después del merge y doble alta de programas → [§7.8](#78-apidb--colecciones-genéricas-p7)
- ICP: cada persona se queda con un registro; el cálculo en segundo plano solo con `POST` y su estado final con
  versión → [§7.9.1](#791-get-apiicpwwebinaridtodos) · [§7.9.2](#792-post-netlifyfunctionsicp-generar-backgroundwwpidpid-ec)
- Meta Ads: plazo de 45 s, `parcial: true`, `effective_status` explícito y `GET /?ids=`; el modo demo exporta sus
  tablas → [§7.10](#710-apimeta-ads-p5) · [§7.10.6](#7106-modo-demo-demo_meta1-d15) ·
  [§8.1](#81-meta-marketing-api-integracionesmeta-adsmjs-p5)
- `/api/registro`: el duplicado responde `ref:''` y `firma:''`; candados `alta:` y `p2:` →
  [§7.12.1](#7121-paso-1-sin-paso-alta) · [§7.12.2](#7122-paso-2-pasorespuestas)
- `salud`: `cuando` en cada servicio, la cola de los servicios con clave y las filas que no se alcanzan →
  [§7.14](#714-netlifyfunctionssalud-p7)
- Envíos: las escrituras de `envios.mjs` van con `fusionarSi`; un servicio sin clave descarta sus envíos y uno
  incompleto espera → [§7.15](#715-envíos-de-un-registro-y-envios-cron-p2)

**Frontend**

- E-43 a E-46: hora por defecto del webinar nuevo, `detalle` de desconectar, moneda en Transacciones y Liquidaciones y
  el botón Guardar del alta → [§9.6](#96-ediciones-de-la-ronda-de-cierre-27102026)
- E-47 a E-53: la tarjeta de salud y las pantallas no piden nada antes del ingreso, el link `#k=` en una pestaña
  abierta, el % del objetivo en Registros, la moneda con código en ARS y en Llamadas, y `/gracias` sin webinar →
  [§9.6](#96-ediciones-de-la-ronda-de-cierre-27102026)

**Semilla, accesos y pruebas**

- Semilla idempotente con manifiesto, `--borrar`, link con `SITIO_URL` o `PORT`; lee `ANUNCIOS_DEMO` y `VIVOS_DEMO`
  del modo demo de Meta; `nuevo-acceso.mjs --lista` → [§10](#10-semilla-de-demo-scriptssemillamjs-p8) ·
  [§12](#12-paquetes-de-trabajo)
- `probar.mjs`: cómo se corre, variables y los casos 25 y 26 en servidores distintos →
  [§11.1](#111-pruebas-de-contrato-scriptsprobarmjs-p8)

**Sanitización**

- El documento no nombra personas ni negocios reales: §9 describe lo que había y los ejemplos de ids de Meta son
  cortos; el grep cubre también `SPEC.md`, `GUIA-WEBINAR.md` y `README.md` (`CREDITOS.md` queda afuera a propósito) →
  [§14.4](#144-sanitización-verificación-final) · [§9](#9-cambios-en-el-frontend) · [D7](#11-arquitectura-decidida-acá-solo-se-precisa)

**Límites conocidos**

- Tamaño de `GET /api/panel` y `/api/icp`, archivados de Meta, `creado` de la semilla con Supabase y el `FOR UPDATE`
  sin probar con conexiones reales → [§14.5](#145-lo-que-esta-revisión-no-pudo-resolver)

**Referencias corregidas:** §4.3 `crm` citaba «§7.7.6» (es §7.6.4) y §7.11 citaba E-21/E-22 (son E-28 a E-30). Seis
filas de tablas (§1.2 iClosed, §4.3 `icp-ia` y `cola`, §4.4 `anun-plan`, `anun-audiencias` y `utm-links`) tenían `|`
sin escapar adentro del código y se partían en GitHub.
