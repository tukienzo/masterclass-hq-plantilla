# Créditos

## El diseño y el frontend

El diseño y el frontend de esta plantilla se basan en «Masterclass HQ», la app de webinars que armó el equipo de BM
con su sistema de diseño ATLAS. Eso incluye la landing (`public/index.html`), la página de gracias
(`public/gracias.html`) y la app interna (`public/app/`).

Cómo se hizo:

- Se copió el frontend publicado de esa app.
- Se le sacaron los datos del negocio original: nombres, textos, cifras e identificadores.
- Se le hicieron solo las ediciones que lista `SPEC.md` §9, para que funcione con un backend nuevo y con la
  configuración de cualquier negocio.
- Se le escribió un backend nuevo.

Los nombres de archivo `ui-atlas.js` y `atlas.css` vienen de ese sistema de diseño.

## Lo que se escribió para esta plantilla

- El backend: `netlify/functions/` y `netlify/lib/`.
- La base de datos: `supabase/schema.sql`.
- Los scripts: `scripts/dev.mjs`, `scripts/semilla.mjs`, `scripts/nuevo-acceso.mjs` y `scripts/probar.mjs`.
- La documentación: `README.md`, `GUIA-WEBINAR.md`, `SPEC.md` y este archivo.
- La demo «Academia Faro» de `scripts/semilla.mjs`. Es un negocio ficticio: sus nombres salen de combinar nombres y
  apellidos comunes, los mails son `@example.com` y los teléfonos usan el rango 555.

## Librerías y recursos de terceros

**Los que carga el frontend desde internet:**

| Recurso | Dónde se usa | Licencia |
|---|---|---|
| Inter (Google Fonts) | La landing, la página de gracias y la app | SIL Open Font License 1.1 |
| JetBrains Mono (Google Fonts) | La app | SIL Open Font License 1.1 |
| world-atlas 2.0.2 (`countries-110m.json`, desde cdn.jsdelivr.net) | El mapa de Ads → Audiencias | ISC. Los datos vienen de Natural Earth, que son de dominio público. |
| Píxel de Meta (`fbevents.js`, desde connect.facebook.net) | La landing y la página de gracias, solo si el negocio conecta un píxel | Las condiciones de las herramientas para empresas de Meta |

**Los que se embeben solo si el negocio los carga:** el video de la página de gracias (YouTube, Vimeo, Wistia o Loom),
con las condiciones de cada servicio. El botón de Google Calendar es un link a Google Calendar con los datos de la
clase.

**Los íconos.** Los trazos SVG de los íconos de la app, en `public/app/js/ui-atlas.js` y en el menú de
`public/app/index.html`, coinciden con los de Lucide, que tiene licencia ISC. Vienen así del frontend original.

**Las dependencias de npm** (`package.json` y lo que instalan, en `node_modules/`):

| Paquete | Versión | Licencia | Para qué |
|---|---|---|---|
| `@anthropic-ai/sdk` | 1.3.0 | Apache-2.0 (las contribuciones anteriores a su cambio de licencia siguen bajo MIT: ver su `LICENSE-MIT`) | El ICP con IA (Claude) |
| `@netlify/functions` | 6.0.3 | MIT | Las funciones de Netlify (`purgeCache` y los tipos) |
| `@netlify/types` | 3.3.0 | MIT | La instala `@netlify/functions` |
| `@babel/runtime` | 7.29.10 | MIT | La instala `json-schema-to-ts` |
| `@opentelemetry/api` | 1.10.0 | Apache-2.0 | La instala `@anthropic-ai/sdk` |
| `@stablelib/base64` | 1.0.1 | MIT | La instala `standardwebhooks` |
| `fast-sha256` | 1.3.0 | Unlicense | La instala `standardwebhooks` |
| `json-schema-to-ts` | 3.1.1 | MIT | La instala `@anthropic-ai/sdk` |
| `standardwebhooks` | 1.1.1 | MIT | La instala `@anthropic-ai/sdk` |
| `ts-algebra` | 2.0.0 | MIT | La instala `json-schema-to-ts` |

Las versiones son las de `package-lock.json`. El texto de la licencia está en la carpeta de cada paquete, dentro de
`node_modules/`, salvo en `@netlify/types` y `standardwebhooks`, que la declaran solo en su `package.json`.

Antes de entregarle esta plantilla a otro negocio, o de publicarla, confirmá con los autores del frontend original que se puede usar así.
