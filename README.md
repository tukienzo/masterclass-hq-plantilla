# Masterclass HQ · plantilla de webinars

Masterclass HQ es una plantilla para que cualquier negocio monte y opere un webinar gratuito que termina en una venta.
Trae tres cosas:

- la **landing pública**, con un registro en dos pasos: primero los datos de contacto, después hasta 3 preguntas de
  calificación;
- la **página de gracias**, con el grupo de WhatsApp y el evento para el calendario (`.ics`);
- la **app interna del equipo**, con 20 pantallas: captación, anuncios, UTM's, llamadas, CRM de ventas, finanzas, KPIs
  y ajustes.

El backend corre en Netlify Functions y guarda los datos en Supabase. Las integraciones son opcionales: Meta Ads, el
píxel con la Conversions API, Calendly o iClosed, Fathom, ActiveCampaign y Claude.

**Para montar tu webinar paso a paso, sin programar, leé [GUIA-WEBINAR.md](GUIA-WEBINAR.md).**

## Arranque rápido (la demo)

Necesitás Node.js 22.12 o más nuevo (lo pide `@netlify/functions`; `.nvmrc` dice `22`).

1. Instalá las dependencias y copiá la configuración de ejemplo:

   ```
   npm ci
   cp .env.ejemplo .env
   ```

2. Abrí `.env` y hacé dos cambios:
   - en `SESION_SECRETO`, poné tu propia clave, generada con
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
   - borrá el `# ` de adelante de `DEMO_META=1`, para que las pantallas de anuncios muestren un gasto de mentira.

3. Cargá la demo y prendé el servidor:

   ```
   npm run semilla -- --reset
   npm run dev
   ```

4. Abrí `http://localhost:8888/app/#k=DEMO-EQPO`. La landing está en `http://localhost:8888/` y la página de gracias
   en `/gracias`.

La demo es «Academia Faro», un negocio ficticio: 3 webinars, 1.700 registros, 72 agendas y 53 ventas y cuotas. Sus
códigos son `DEMO-EQPO` (equipo), `DEMO-CLTE` (cliente), `DEMO-LAUR` y `DEMO-DIEG` (closers).

**Esos códigos son públicos.** Antes de usar una base con datos reales, sacá la demo con
`npm run semilla -- --borrar`, entrá con tu `CODIGO_INICIAL` y creá los accesos desde Equipo. `CODIGO_INICIAL` sirve
solo si no queda ninguna persona, tampoco una dada de baja (`npm run probar` deja una): si no, creá tu acceso con
`npm run acceso`. `DEMO_META=1` nunca va en un sitio de verdad.

Para probar tu propio negocio en la compu, sin la demo, usá otra carpeta de datos y tus variables `NEGOCIO_*` en
`.env`: los pasos están en la guía, en
[Tu negocio en tu compu, sin la demo](GUIA-WEBINAR.md#tu-negocio-en-tu-compu-sin-la-demo).

## Estructura del repo

```
├── GUIA-WEBINAR.md          la guía para el dueño o el operador del webinar
├── SPEC.md                  el contrato del backend: variables, datos, sesión, roles, endpoints y pruebas
├── CREDITOS.md              de dónde sale el frontend y las licencias de terceros
├── package.json             scripts y las 2 dependencias
├── .nvmrc                   la versión de Node (22)
├── .env.ejemplo             todas las variables, con valores de ejemplo
├── netlify.toml             qué se publica, dónde están las funciones y los headers
├── supabase/schema.sql      la tabla mhq_docs, sus índices, permisos y funciones (se puede volver a ejecutar)
├── public/                  el frontend
│   ├── index.html, gracias.html, css/, js/       la landing y la página de gracias
│   └── app/                                      la app del equipo (index.html, css/, js/, js/pantallas/)
├── netlify/
│   ├── functions/           una función por endpoint: /api/acceso, /api/app, /api/panel, /api/crm, /api/db,
│   │                        /api/meta-ads, /api/icp, /api/tablero, /api/agendas-sync, /api/publico,
│   │                        /api/registro, salud, icp-generar-background y dos programadas
│   └── lib/                 el código compartido: almacén (Supabase o archivos), sesión, configuración,
│                            proyección, checklist, landing, registros, pipeline, CRM, atribución e integraciones
└── scripts/
    ├── dev.mjs              servidor local
    ├── semilla.mjs          la demo
    ├── nuevo-acceso.mjs     accesos desde la terminal
    └── probar.mjs           pruebas de contrato
```

## Scripts

Todos leen `.env` de la raíz y no pisan lo que ya viene del entorno.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local en `PORT` (8888 por defecto). Sirve `public/` y las funciones con las mismas rutas que Netlify, y emula las funciones background. Las programadas se disparan a mano con `POST /__cron/agendas-sync-cron` o `POST /__cron/envios-cron`, o solas con `DEV_CRON=1`. |
| `npm run semilla` | Carga la demo o la pone al día. Se puede correr varias veces: no duplica nada. |
| `npm run semilla -- --reset` | Vacía todas las colecciones y carga la demo de cero. |
| `npm run semilla -- --borrar` | Saca **solo** lo que cargó la demo. Lo cargado a mano queda. |
| `npm run semilla -- --hoy=AAAA-MM-DD` | Corre las fechas de la demo a ese día. El servidor sigue usando el reloj real. |
| `npm run semilla -- … --si-supabase` | Hace falta para correrla contra Supabase, así no pisa datos reales por error. |
| `npm run acceso -- <nombre> <rol>` | Crea una persona (`equipo`, `cliente` o `closer`) y muestra su código y su link **una vez**. |
| `npm run acceso -- --codigo <uid>` | Le genera un código nuevo a esa persona: el viejo deja de andar y, si estaba de baja, la reactiva. |
| `npm run acceso -- --lista` | Muestra las personas con su uid. |
| `npm run probar` | Corre los 44 casos de contrato de `SPEC.md` §11.1 contra un servidor ya levantado. Sale con 1 si falla alguno. |

La semilla y `nuevo-acceso.mjs` usan el mismo `SESION_SECRETO` que el servidor: con él se guardan los códigos. Para
correrlos contra tu base de producción, el `.env` local necesita `ALMACEN=supabase`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, el mismo `SESION_SECRETO` de Netlify y `SITIO_URL` (ver la guía, sección 3.6).

### Cómo correr `probar`

`probar` necesita la semilla **recién cargada con `--reset`** y un servidor con `DEMO_META=1`. El caso 25 pide además
un segundo servidor **sin** `DEMO_META`, con el mismo `.env` y la misma carpeta de datos: se le pasa en
`BASE_URL_SIN_DEMO`. Sin él, el caso 25 se saltea, y un caso salteado no hace fallar la corrida.

```
npm run semilla -- --reset
npm run dev                                 # terminal 1, con DEMO_META=1 en .env
PORT=8889 DEMO_META=0 npm run dev           # terminal 2
BASE_URL=http://localhost:8888 BASE_URL_SIN_DEMO=http://localhost:8889 npm run probar
```

En PowerShell, las dos últimas líneas son `$env:PORT='8889'; $env:DEMO_META='0'; npm run dev` y
`$env:BASE_URL='http://localhost:8888'; $env:BASE_URL_SIN_DEMO='http://localhost:8889'; npm run probar`.

`DATOS_DIR` es opcional: con ella, el caso 40 mira además la copia guardada en el disco. La corrida deja un registro
nuevo, una persona de prueba dada de baja y el estado del sync de agendas, así que para repetirla entera hay que volver
a correr `npm run semilla -- --reset`. El único pedido que intenta salir a internet es el del caso 35 (una clave
inválida contra iClosed), y el caso pasa con red o sin red.

## Estado

Ver la sección de pruebas al final.

## Más

- [SPEC.md](SPEC.md): el contrato completo del backend.
- [CREDITOS.md](CREDITOS.md): créditos del diseño y del frontend, y licencias de terceros.
- [GUIA-WEBINAR.md](GUIA-WEBINAR.md): la guía de uso.

## Pruebas

Última verificación: 27/10/2026, sobre el código de esta versión, en Windows con Node 24 y Chrome manejado por
Playwright. Nada salió a internet: en el servidor, un `fetch` de prueba devuelve 503 a todo lo que no es local (el
único pedido que lo intentó fue el del caso 35 de `probar`, contra iClosed), y el navegador solo dejó pasar
`localhost`, Google Fonts y jsDelivr (el mapa). Antes de cada prueba que cambia datos se volvió a cargar la semilla con
`--reset`, con un servidor con `DEMO_META=1` y otro sin, sobre la misma carpeta de datos.

| Qué se probó | Resultado |
|---|---|
| `npm run probar`: los 44 casos de contrato de `SPEC.md` §11.1 | 44 pasan, 0 fallan |
| La semilla dos veces seguidas (`--reset` y después sin opciones) | los mismos 1.863 documentos, ninguno distinto, y la misma salida |
| Navegador · Captación: Ads, UTM's, Trazabilidad, ICP, Inicio, KPIs y Funnel, con demo y sin demo | 174 chequeos, 0 fallan |
| Navegador · Llamadas (las 6 pestañas) y Ventas, como equipo y como closer | 323 chequeos, 0 fallan |
| Navegador · Webinar, Registros, Landing, Integraciones, Equipo y Finanzas, con demo y sin demo | 374 chequeos, 0 fallan |
| Lo mismo con la moneda del negocio en MXN | 40 chequeos, 0 fallan |
| Navegador · la landing y la página de gracias, también sobre un servidor vacío, sin semilla | 217 chequeos, 0 fallan |
| `GUIA-WEBINAR.md` y este README contra el código y contra la demo | 87 chequeos, 0 fallan |
| Los arreglos de la última ronda: la proyección redondeada, el link `/app/#k=` en una pestaña abierta, el % del objetivo en Registros, la moneda en ARS y `/gracias` sin webinar | 40 chequeos, 0 fallan |
| `SPEC.md`: links internos, filas de tablas y el SQL igual a `supabase/schema.sql` | 69 links, 677 filas, sin errores |
| `node --check` sobre el JavaScript de `public/`, `netlify/` y `scripts/` | 71 archivos, 0 errores |
| El grep de sanitización de `SPEC.md` §14.4 sobre el código y los tres documentos | 92 archivos; solo quedan nombres técnicos de archivos y de una librería |

**Los almacenes.** Todo lo de la tabla corrió con `ALMACEN=archivo`. El driver Supabase se probó con el
`supabase/schema.sql` real cargado en PGlite (Postgres compilado a WebAssembly) detrás de un PostgREST falso: las
primitivas del almacén (37 chequeos), el candado del primer ingreso (6), la semilla dos veces (1.863 documentos
iguales) y `npm run probar` con dos servidores (44 pasan, 0 fallan). **No se probó contra un Supabase real**, ni el
deploy en Netlify.

**Las integraciones.** Ninguna se probó contra su servicio real: ni Meta Ads, ni la Conversions API, ni Calendly,
iClosed, Fathom, ActiveCampaign o Claude. Corrieron con el modo demo de Meta (`DEMO_META=1`), con respuestas simuladas
o con el `fetch` de prueba, que les devuelve error. Los comandos de la guía para Mac tampoco se probaron en una Mac.
