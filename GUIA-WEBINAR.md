# Guía: tu webinar con Masterclass HQ

Esta guía te lleva de cero a un webinar funcionando con esta plantilla, y después te acompaña a operarlo día por día.
No hace falta programar: alcanza con saber usar la computadora, copiar y pegar, y seguir los pasos en orden.

Los ejemplos usan **Academia Faro**, el negocio ficticio de la demo. Donde veas `tu-sitio.netlify.app`, poné la
dirección de tu sitio.

La app ordena el trabajo y muestra los números. No promete ventas: lo que pase con tu webinar depende de tu oferta,
de tu público y de cómo lo trabajes.

## Índice

1. [Qué es y qué vas a tener al final](#1-qué-es-y-qué-vas-a-tener-al-final)
2. [Probala en tu compu en 10 minutos](#2-probala-en-tu-compu-en-10-minutos)
3. [Ponela en internet con tu negocio](#3-ponela-en-internet-con-tu-negocio)
4. [Configurá tu negocio y tu webinar](#4-configurá-tu-negocio-y-tu-webinar)
5. [Conectá tus herramientas](#5-conectá-tus-herramientas)
6. [El equipo y los roles](#6-el-equipo-y-los-roles)
7. [Cómo operar tu webinar día por día](#7-cómo-operar-tu-webinar-día-por-día)
8. [Problemas comunes y límites conocidos](#8-problemas-comunes-y-límites-conocidos)

---

## 1. Qué es y qué vas a tener al final

Masterclass HQ es una plantilla para montar y operar un webinar gratuito que termina en una venta. Al final vas a tener
tres cosas en tu propio sitio:

**La landing** (`https://tu-sitio.netlify.app/`). Muestra los textos del webinar que tenés "en la landing", una cuenta
regresiva y el formulario de registro, que va en dos pasos:

1. La persona deja nombre, email, país y WhatsApp. Con eso el registro ya queda guardado.
2. Contesta hasta 3 preguntas de calificación, con un toque cada una. Con esas respuestas la app sabe quién es un
   registro calificado.

Cuando termina la clase, la landing dice «Esta clase ya terminó» y no toma más registros.

**La página de gracias** (`/gracias`). Le muestra a la persona los pasos que le faltan, numerados:

- entrar al grupo de WhatsApp (por ahí le llega el link del directo);
- el paso del mail, si lo cargaste;
- un video, si lo cargaste;
- agregar la clase a su calendario: Google Calendar o un archivo `.ics` para Apple y Outlook, con avisos 1 hora y
  10 minutos antes.

**La app del equipo** (`/app/`). Cada persona entra con su código personal. Estas son sus 20 pantallas, agrupadas como
en el menú:

| Menú | Pantalla | Para qué sirve |
|---|---|---|
| Inicio | **Inicio** | La salud del webinar con semáforo (Registros, Anuncios, Agendas, Closing, Cash) contra lo que proyectaste. «Hoy» junta lo que se está cayendo: llamadas sin closer, sin confirmar, no-shows sin re-agendar y ventas sin monto. También trae la proyección contra lo real, la carga de la asistencia al vivo y los KPIs que fijaste. |
| Captación | **Ads** | Seis pestañas: Dashboard (gasto, costo por registro, costo por registro calificado, ROAS), Feed (anuncio por anuncio), Calendario, Planificar (un tablero de campañas), Contactos (las agendas que vienen de la pauta, con CSV) y Audiencias (los compradores por país y el CSV con sus datos cifrados, para subir a mano a Meta). Necesita Meta conectada. **No escribe nada en Meta**: no pausa ni cambia presupuestos. |
| Captación | **UTM's** | Registros por fuente, campaña y anuncio, con su embudo hasta la compra. Tiene el armador de links con UTM. |
| Captación | **Trazabilidad** (pestaña de UTM's) | El recorrido de cada lead que agendó: de qué anuncio vino, si calificó, sus llamadas y cómo terminó. |
| Captación | **ICP** | Quién compra, según lo que contestó en la landing y en el formulario de agenda. Con la IA conectada, arma perfiles de comprador. |
| Captación | **Registros** | Total, registros de hoy, calificados, por día y por fuente, si salieron bien a ActiveCampaign y a Meta, y la tabla de personas con buscador. |
| Captación | **Landing** | El editor de los textos de la landing, de la página de gracias y de las preguntas de calificación. |
| Conversión | **Funnel** | Embudo (de la inversión al cash, paso por paso, contra la proyección y por fuente) y Comparador (tus webinars lado a lado). |
| Conversión | **Llamadas → Métricas** | Agenda, asistencia y cierre por closer, el leaderboard y la comparativa. |
| Conversión | **Llamadas → Agendas** | Las etapas de la llamada, el calendario, la tabla de agendas, «Agendar llamada», «Importar» (CSV) y «Sincronizar». |
| Conversión | **Llamadas → Análisis** | La calidad de las llamadas, evaluadas a mano con una rúbrica. |
| Conversión | **Llamadas → Pipeline** | Las agendas en columnas por estado. |
| Conversión | **Llamadas → Llamadas** | El tablero del día (con closer y sin closer) y los días anteriores con su resultado. |
| Conversión | **Llamadas → Pre-call** | Las próximas 48 horas, con lo que cada lead contestó al agendar y en la landing. |
| Conversión | **Ventas** | El CRM: Ventas (una fila por llamada), Cuotas y Leaderboard. Desde acá cargás un cierre como plan de pagos, manejás el catálogo de Programas y traés las llamadas que quedaron sin cargar. |
| Empresa | **Finanzas** | Resumen (facturación, cash cobrado, gasto en anuncios, ROAS y lo que falta cobrar), Ventas (cada cobro y las cuotas pendientes) y Liquidaciones (la comisión de cada closer y si ya se le pagó). La facturación es lo que pagaron las ventas nuevas en el período, no el precio total de lo vendido: lo que falta cobrar está en «Cuentas por cobrar». |
| Empresa | **KPIs** | Tarjetas por área (Captación, Agendas, Closer, Negocio, Equipo) contra la proyección. La chinche las fija en el Inicio. |
| Ajustes | **Webinar** | Los datos del webinar, la proyección y la checklist. Desde acá también se crea un webinar nuevo y se elige cuál va en la landing. |
| Ajustes | **Integraciones** | Las 6 conexiones: Meta, Calendly, iClosed, Fathom, IA (Claude) y ActiveCampaign. |
| Ajustes | **Equipo** | Quién tiene acceso: crear accesos, generar códigos nuevos y dar de baja. |

Abajo del menú hay una tarjeta que dice cuántas conexiones andan bien, por ejemplo «2 conexiones, todas bien».
Si la tocás, te muestra el detalle.

**Lo que la plantilla no hace**, para que no lo busques:

- No transmite el vivo: eso lo hacés con tu plataforma de transmisión.
- No manda mails. Si conectás ActiveCampaign, los manda tu automatización de ActiveCampaign.
- No crea ni toca anuncios: solo lee lo que pasa en tu cuenta de Meta.
- No cobra: registra las ventas y las cuotas que cargás vos.
- No tiene página para agendar llamadas: las agendas vienen de Calendly o iClosed, o las cargás a mano o por CSV.

---

## 2. Probala en tu compu en 10 minutos

Con la demo vas a ver la app llena de datos de mentira (Academia Faro: 3 webinars, 1.700 registros, 72 agendas y
53 ventas y cuotas) antes de cargar nada tuyo.

### Lo que tenés que instalar

- **Node.js 22.12 o más nuevo.** Una de las dependencias (`@netlify/functions`) pide como mínimo esa versión.
  Bajalo de nodejs.org (la versión LTS sirve). Para ver qué versión tenés, abrí una terminal y escribí:

  ```
  node --version
  ```

  Tiene que decir `v22.12.0` o un número más alto (por ejemplo `v24.…`).
- **La carpeta de la plantilla** en tu compu.
- **Una terminal abierta en esa carpeta.** En Windows: abrí la carpeta en el Explorador, hacé clic derecho en un
  espacio vacío y elegí «Abrir en Terminal». En Mac: abrí la app Terminal, escribí `cd `, arrastrá la carpeta a la
  ventana y apretá Enter.

### Los pasos

1. Instalá las dependencias (tarda unos segundos y necesita internet):

   ```
   npm ci
   ```

2. Creá tu archivo de configuración copiando el de ejemplo:

   ```
   cp .env.ejemplo .env
   ```

   Funciona en la terminal de Mac y en la de Windows (PowerShell). Si usás el viejo «Símbolo del sistema» de
   Windows, es `copy .env.ejemplo .env`.

3. Generá tu clave de sesión. Este comando escribe 64 letras y números al azar:

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Abrí `.env` con un editor de texto (Bloc de notas o TextEdit). En Windows, el doble clic te pregunta con qué
   aplicación abrirlo: hacé clic derecho en `.env` → **Abrir con** → **Bloc de notas**. En Mac, Finder esconde los
   archivos que empiezan con punto: Cmd+Shift+. los muestra. Reemplazá la fila de ceros de `SESION_SECRETO=` por lo que
   te dio el comando.

4. En el mismo `.env`, borrá el `# ` de adelante de `# DEMO_META=1` para que quede `DEMO_META=1`. Así las pantallas
   de anuncios muestran un gasto de mentira. **Es solo para la demo: nunca lo cargues en tu sitio de verdad.**
   Guardá el archivo.

5. Cargá la demo:

   ```
   npm run semilla -- --reset
   ```

   Tarda unos 15 segundos y al final te muestra los códigos de acceso con sus links.

6. Prendé el servidor y dejá esa terminal abierta:

   ```
   npm run dev
   ```

7. Abrí en el navegador `http://localhost:8888/app/#k=DEMO-EQPO`. Entrás directo como Ana Demo, del equipo.

Para apagar el servidor, volvé a la terminal y apretá Ctrl+C. Si querés volver la demo a cero, corré otra vez
`npm run semilla -- --reset`.

### Los accesos de la demo

| Código | Persona | Rol | Qué vas a ver |
|---|---|---|---|
| `DEMO-EQPO` | Ana Demo | Equipo | Las 20 pantallas |
| `DEMO-CLTE` | Carla Demo | Cliente | Las 20 pantallas (en Equipo no puede tocar a alguien del equipo) |
| `DEMO-LAUR` | Laura Gómez | Closer | Llamadas, Ventas (solo lo suyo) y la ficha del webinar |
| `DEMO-DIEG` | Diego Ruiz | Closer | Lo mismo que Laura, con sus propias ventas |

Probá también `http://localhost:8888/` (la landing) y `http://localhost:8888/gracias`.

Un recorrido corto para entender la app: mirá el **Inicio**, abrí **Ajustes → Webinar** para ver la proyección y la
checklist, pasá por **Conversión → Funnel → Comparador** y entrá como `DEMO-LAUR` para ver lo que ve un closer.

Para cambiar de persona, abrí `http://localhost:8888/app/#k=DEMO-LAUR` (en la misma pestaña o en otra), o tocá el
botón de salir (abajo del menú, al lado de tu nombre) y escribí `DEMO-LAUR`.

> **Los códigos de la demo son públicos**: están escritos en esta guía y en el código. La demo sirve para probar.
> Si alguna vez la cargás en una base que después vas a usar de verdad, sacala con `npm run semilla -- --borrar`
> (contra Supabase, `npm run semilla -- --borrar --si-supabase`), entrá con tu `CODIGO_INICIAL` (sección 3.5) y
> después creá los accesos desde Equipo (sección 6). `--borrar` saca solo lo que cargó la demo.
>
> `CODIGO_INICIAL` sirve solo mientras no hay **ninguna** persona, tampoco una dada de baja. Si en esa base corriste
> `npm run probar`, quedó una persona de prueba dada de baja y `CODIGO_INICIAL` ya no entra: creá tu acceso con
> `npm run acceso` (sección 3.6).

### Tu negocio en tu compu, sin la demo

Antes de ponerla en internet podés probar la app con los datos de tu negocio, sobre una base vacía:

1. Cortá el servidor con Ctrl+C.
2. Abrí `.env` y cambiá esto:
   - `DATOS_DIR=.datos` por `DATOS_DIR=.datos-mio`: es una carpeta nueva y vacía. La de la demo queda como estaba;
   - volvé a poner `# ` adelante de `DEMO_META=1`;
   - en `CODIGO_INICIAL`, poné un código tuyo con la forma `XXXX-XXXX`, y sacale el `# ` a `ADMIN_NOMBRE` para poner
     tu nombre;
   - sacale el `# ` a `NEGOCIO_NOMBRE`, `NEGOCIO_MONEDA`, `NEGOCIO_ZONA`, `NEGOCIO_PAIS` y `NEGOCIO_PREFIJO_TEL`, y
     poné tus valores (la sección 4.1 explica cada uno). En tu compu no hay una pantalla para cargarlos: van acá.
3. Guardá el archivo y volvé a correr `npm run dev`. Esta vez no corras la semilla.
4. Abrí `http://localhost:8888/app/` y seguí desde la sección 3.5: el primer ingreso es con tu `CODIGO_INICIAL`.
   Después, la sección 4 te lleva por el webinar, la proyección y la landing.

Hace falta la carpeta nueva porque la demo guarda en su base sus propios datos del negocio (el nombre, la moneda y la
zona de Academia Faro), y esos datos pisan a las variables que empiezan con `NEGOCIO_`.

Cada vez que cambies `.env`, cortá el servidor y volvé a prenderlo. Para volver a la demo, poné otra vez
`DATOS_DIR=.datos` y `DEMO_META=1`.

---

## 3. Ponela en internet con tu negocio

En internet la plantilla usa dos servicios:

- **Netlify** publica la landing, la página de gracias y la app, y corre las funciones (el "servidor").
- **Supabase** es la base de datos donde se guarda todo.

Los dos tienen plan gratuito. Antes de arrancar, revisá en cada uno qué incluye ese plan.

### 3.1 Supabase: la base de datos

1. Creá una cuenta en supabase.com y un proyecto nuevo. Te pide un nombre, una contraseña para la base y una
   región. La contraseña guardala vos: la app no la usa. Elegí la región más cerca de tu público. Si en las opciones
   aparece la Data API, dejala habilitada, porque la app habla con la base por ahí.
2. En el menú del proyecto abrí el **SQL Editor** y empezá una consulta nueva. Abrí el archivo `supabase/schema.sql`
   de la plantilla, copiá **todo** el contenido, pegalo y ejecutalo con el botón Run. Tiene que terminar sin errores.
   En el **Table Editor** va a aparecer una tabla que se llama `mhq_docs`.
   - Si Supabase te avisa que la consulta tiene operaciones que pueden borrar datos, confirmá igual. El archivo solo
     crea la tabla, sus permisos y sus funciones. La palabra `delete` está adentro de una función que limpia contadores
     viejos.
   - Este archivo se puede volver a ejecutar entero sin perder datos. Hacelo cada vez que bajes una versión nueva de
     la plantilla, **antes** de publicarla.
3. Copiá dos datos. Los dos están en **Project Settings**, el engranaje de abajo a la izquierda del menú del proyecto:
   - la **URL del proyecto**, que tiene la forma `https://<letras>.supabase.co`. Está en **Project Settings → Data
     API**, como **Project URL**, y también aparece con el botón «Connect» de arriba;
   - la **clave secreta**, que empieza con `sb_secret_`. Está en **Project Settings → API Keys**, en la parte
     **Secret keys**: tocá el botón de copiar de esa clave (si no hay ninguna, creá una con el botón para agregar). Si
     solo ves **Legacy API keys**, la que va es la `service_role`: tocá **Reveal** para verla y copiala. Nunca uses la
     `anon` ni la `publishable`.

> **La clave secreta abre toda tu base.** Pegala solo en las variables de Netlify (y en tu `.env` local, si corrés
> los scripts de la sección 3.6). Nunca la mandes por un chat ni la subas al repositorio. Si se filtra, creá una nueva
> en Supabase, borrá la vieja, cambiala en Netlify y volvé a publicar.

### 3.2 Tu copia en GitHub

Netlify publica desde un repositorio. Subí la carpeta de la plantilla a un repositorio **privado** tuyo en GitHub. La
forma más simple sin usar la terminal es la app GitHub Desktop. Depende de cómo te llegó la plantilla:

- **Si la bajaste como `.zip`:** en GitHub Desktop, **File → Add local repository** y elegí la carpeta. Te va a decir
  que no es un repositorio: tocá **create a repository** y después **Publish repository**, con **Keep this code
  private** marcado.
- **Si la clonaste del repositorio de otra persona:** GitHub Desktop te va a ofrecer **Push origin**, que sube al
  repositorio de esa persona, no al tuyo. Primero creá un repositorio nuevo y privado en github.com. Después, en
  GitHub Desktop, andá a **Repository → Repository settings → Remote**, pegá la dirección de tu repositorio nuevo y
  recién ahí publicá.

El archivo `.gitignore` ya deja afuera `.env`, `node_modules/` y las carpetas de datos `.datos…/`. Antes de publicar,
fijate que `.env` **no** esté en la lista de archivos que se suben.

### 3.3 Netlify: el sitio

1. Creá una cuenta en netlify.com y un sitio nuevo a partir de un repositorio existente. Según la versión del panel,
   la opción se llama «Add new site» o «Add new project», y después «Import an existing project». Conectá GitHub y
   elegí tu repositorio.
2. En la configuración de la build no hace falta tocar nada. El archivo `netlify.toml` ya le dice a Netlify que publique
   la carpeta `public` y que las funciones están en `netlify/functions`. El comando de build queda vacío. La versión
   de Node la toma del archivo `.nvmrc`, que dice `22`.
3. Antes de usarla, cargá las variables de entorno. Están en la configuración del sitio (según la versión, «Site
   configuration» o «Project configuration»), en **Environment variables**. Cada variable tiene que estar disponible
   para **Functions**: dejá todos los scopes o, si elegís algunos, incluí Functions. Si el panel te deja marcarla
   como secreta, marcala.
   - No las pongas en `netlify.toml`: Netlify no se las pasa a las funciones.
4. Publicá. **Cada vez que cambies una variable, volvé a desplegar** (en Deploys está la opción para disparar un deploy
   nuevo): los valores nuevos recién se ven en el deploy siguiente.

Tu sitio queda en `https://tu-sitio.netlify.app`. Si después querés un dominio propio, se configura en la parte de
dominios del mismo panel.

### 3.4 Las variables, una por una

**Las que no pueden faltar:**

| Variable | Qué poner |
|---|---|
| `SESION_SECRETO` | 64 letras y números al azar, generados con el comando del paso 3 de la sección 2 (o con `openssl rand -hex 32` en Mac o Linux). Usá una distinta de la que generaste para la demo. Firma las sesiones y los códigos. **Si la cambiás, se cierran todas las sesiones, dejan de andar todos los códigos y, si no cargaste `CIFRADO_SECRETO`, también las claves de Integraciones.** |
| `CODIGO_INICIAL` | El código de tu primer ingreso, con la forma `XXXX-XXXX` (letras y números). Inventá uno que nadie pueda adivinar: **no uses el del ejemplo**. Solo sirve mientras no hay ninguna persona creada. |
| `SUPABASE_URL` | La URL del proyecto de Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave secreta de Supabase (`sb_secret_…` o la `service_role`). |

**Recomendadas:**

| Variable | Qué poner |
|---|---|
| `CIFRADO_SECRETO` | Otros 64 caracteres al azar, distintos de `SESION_SECRETO`. Cifra las claves que pegás en Integraciones. Si falta, se deriva de `SESION_SECRETO`. Cargala desde el principio: si la agregás o la cambiás con integraciones ya conectadas, hay que volver a conectarlas. |
| `ADMIN_NOMBRE` | Tu nombre, para la primera persona. Si no está, entrás como «Admin». |

**Tu negocio** (las explica la sección 4.1): `NEGOCIO_NOMBRE`, `NEGOCIO_COLOR`, `NEGOCIO_MONEDA`, `NEGOCIO_ZONA`,
`NEGOCIO_PAIS`, `NEGOCIO_LOCALE`, `NEGOCIO_PREFIJO_TEL`, `WEBINAR_DURACION_MIN` y `WEBINAR_HORA`.

**Tus herramientas** (las explica la sección 5; todas opcionales): `META_TOKEN`, `META_CUENTA`, `META_PIXEL`,
`META_CAPI_TOKEN`, `META_API_VERSION`, `CALENDLY_TOKEN`, `ICLOSED_API_KEY`, `FATHOM_API_KEY`, `FATHOM_EQUIPO`,
`ANTHROPIC_API_KEY`, `ICP_MODELO`, `AC_URL`, `AC_KEY` y `AC_LISTA`.

**Límites** (opcionales):

| Variable | Por defecto | Qué controla |
|---|---|---|
| `REGISTRO_LIMITE_HORA` | 20 | Registros por hora desde una misma conexión. Después, la landing dice «Demasiados intentos desde esta conexión». |
| `ACCESO_LIMITE` | 10 | Códigos equivocados desde una misma conexión cada 15 minutos. Después, la app dice «Demasiados intentos». |
| `META_CACHE_S` | 300 | Segundos que la app guarda cada respuesta de Meta antes de volver a preguntar. |

**Las que no van en Netlify:**

- `ALMACEN`: no la cargues. Si la cargás, que diga `supabase`. Con `archivo`, cada pedido da el error «Falta
  configurar Supabase», porque en Netlify no se puede guardar en archivos.
- `DEMO_META`: es para la demo. En tu sitio llenaría Ads de números inventados.
- `DATOS_DIR`, `PORT`, `DEV_PAIS` y `DEV_CRON`: son solo para tu compu.
- `SITIO_URL`: solo la usan los scripts de tu compu, para escribir bien el link `/app/#k=`.

### 3.5 El primer ingreso

1. Abrí `https://tu-sitio.netlify.app/app/` y escribí tu `CODIGO_INICIAL`. También podés entrar directo con el link
   `https://tu-sitio.netlify.app/app/#k=<tu código>`. Entrás con el nombre de `ADMIN_NOMBRE` y el rol Equipo.
2. Andá a **Ajustes → Equipo** y tocá «Código nuevo» en tu fila. La app te muestra un código al azar **una sola vez**:
   guardalo en un lugar seguro. Desde ese momento entrás con ese código y `CODIGO_INICIAL` ya no sirve para nada. Si
   querés, borrá la variable de Netlify.
3. Fijate en la tarjeta de abajo del menú: con nada conectado tiene que decir «2 conexiones, todas bien» (la base de
   datos y las sesiones).
4. La landing va a decir «No hay una clase abierta en este momento.» hasta que crees tu primer webinar (sección 4.2).

Tu sesión dura 30 días y se renueva sola mientras uses la app. El botón para salir está abajo de todo del menú, al lado de tu
nombre.

### 3.6 Crear y recuperar códigos desde tu compu

Normalmente los accesos se crean desde la pantalla Equipo (sección 6). El script `nuevo-acceso.mjs` existe para cuando
nadie del equipo puede entrar: perdiste tu código, cambiaste `SESION_SECRETO` o todavía no entró nadie.

Para que trabaje sobre tu base de verdad, tu `.env` local tiene que decir esto. Si lo copiaste de `.env.ejemplo`,
cambiá la línea `ALMACEN=archivo` por `ALMACEN=supabase`: si no, el script escribe en una carpeta de tu compu.

```
ALMACEN=supabase
SUPABASE_URL=https://<letras>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<tu clave secreta>
SESION_SECRETO=<exactamente la misma que en Netlify>
SITIO_URL=https://tu-sitio.netlify.app
```

`SESION_SECRETO` tiene que ser idéntica a la de Netlify: con ella se guardan los códigos. Si es otra, el código que
te da el script no va a andar en el sitio.

```
npm run acceso -- --lista
```

Muestra las personas con su `uid`, su rol y si están activas.

```
npm run acceso -- "Nombre Apellido" equipo
```

Crea una persona (el rol puede ser `equipo`, `cliente` o `closer`) y te muestra su código y su link **una sola vez**.

```
npm run acceso -- --codigo <uid>
```

Le genera un código nuevo a esa persona. El viejo deja de andar y se cierran sus sesiones. Si estaba dada de baja,
vuelve a quedar activa.

Cuando termines, si no vas a volver a usar los scripts, sacá la clave secreta de tu `.env` local.

---

## 4. Configurá tu negocio y tu webinar

### 4.1 Los datos del negocio

Se cargan como variables en Netlify. Todas son opcionales: si no ponés nada, se usan los valores por defecto. En tu
compu van en `.env`, sin el `#` de adelante, y después hay que cortar y volver a correr `npm run dev` (mirá
[Tu negocio en tu compu, sin la demo](#tu-negocio-en-tu-compu-sin-la-demo)).

| Variable | Por defecto | Qué cambia |
|---|---|---|
| `NEGOCIO_NOMBRE` | `Mi Negocio` | El nombre en la landing, en la app y en el pie. |
| `NEGOCIO_COLOR` | `#3b82f6` | El color de acento de la landing y de la app, con la forma `#rrggbb`. |
| `NEGOCIO_MONEDA` | `USD` | La moneda de los montos, con su código de tres letras: `USD`, `EUR`, `MXN`, `COP`, `ARS`… |
| `NEGOCIO_ZONA` | `America/Argentina/Buenos_Aires` | La zona horaria del negocio. Con ella se calcula "hoy", el día de cada registro, la hora de las llamadas y el mes de las ventas. Ejemplos: `America/Bogota`, `America/Mexico_City`, `America/Santiago`, `Europe/Madrid`. |
| `NEGOCIO_PAIS` | `AR` | El país que aparece primero en el formulario y el que se usa para un teléfono sin código de país. Va uno de estos: `AR`, `BO`, `CL`, `CO`, `CR`, `DO`, `EC`, `ES`, `GT`, `HN`, `MX`, `NI`, `PA`, `PE`, `PR`, `PY`, `SV`, `US`, `UY`, `VE`. |
| `NEGOCIO_LOCALE` | `es-AR` | El idioma y formato regional que informa la app. Hoy la mayoría de las pantallas formatean igual con `es-AR`. |
| `NEGOCIO_PREFIJO_TEL` | `549` en Argentina; en el resto, el código del país | Con este prefijo Ads → Audiencias completa los números locales de 10 dígitos. |
| `WEBINAR_DURACION_MIN` | `180` | Cuántos minutos dura la clase. A esa hora la landing cierra el registro y ahí termina el evento del calendario. Cada webinar guarda la duración que había cuando lo creaste, y la pantalla Webinar no tiene un campo para cambiarla. Por eso, ajustala **antes** de crearlo. |
| `WEBINAR_HORA` | `20:00` | La hora que propone el formulario de un webinar nuevo. |

Un valor mal escrito (un color sin `#`, una zona que no existe) no rompe nada: se usa el de por defecto.

**Para quien se anime a la base:** en Supabase, una fila de `mhq_docs` con `col` = `ajustes` e `id` = `negocio` pisa
estas variables campo por campo. En la columna `data` va un JSON como el de la demo:
`{"nombre":"Academia Faro","color":"#2563eb","moneda":"USD","zona":"America/Bogota","pais":"CO","prefijoTel":"57"}`.
Esa fila también acepta `vara`, con los valores de referencia de la proyección (sección 4.4), y `formatos` y
`cierres`, con las listas del webinar. Ningún campo es obligatorio. La app tarda hasta 30 segundos en ver el cambio.

### 4.2 Crear el webinar y ponerlo en la landing

1. Entrá a **Ajustes → Webinar**. La primera vez la pantalla dice «El primer webinar».
2. Completá el nombre interno (lo ve solo tu equipo), la fecha y la hora del vivo en la zona de tu negocio. Si vas a
   hacer una sesión de venta aparte después del vivo, cargá también la fecha y la hora del pop-up.
3. Tocá «Crear webinar». La app arma sola:
   - la checklist de 25 tareas, con fechas contadas desde el vivo (sección 4.3);
   - la landing: copia la del webinar que está en la landing, o la de ejemplo si es el primero;
   - la ventana de cierre en 10 días;
   - la etiqueta para ActiveCampaign, `webinar-<fecha>`;
   - la duración, que sale de `WEBINAR_DURACION_MIN`.
4. **Activarlo:** si no había ningún webinar en la landing, el nuevo queda activo solo y la ficha dice «En la landing».
   Si no, tocá «Usar en la landing». La landing muestra un webinar por vez.

En **Datos del webinar** también están:

- el **Formato** (Masterclass en vivo, Webinar con Q&A, Taller práctico o Clase grabada);
- el **Cierre**, o sea cómo se vende (Llamada, Checkout o Checkout + llamada);
- la **Ventana de cierre**: cuántos días después del vivo cuentan como ventas de este webinar. Va de 1 a 60.
- la **Etiqueta en ActiveCampaign**.

Si movés la fecha del vivo, todas las tareas de la checklist se corren con ella. «Borrar webinar» borra el webinar y
su checklist. Los registros quedan guardados.

Con el selector de arriba a la derecha cambiás de webinar, y con «＋ Nuevo webinar» creás el siguiente.

### 4.3 La checklist

Cada webinar nuevo trae 25 tareas en 8 fases. Cada tarea vence a cierta cantidad de días del vivo: T-21 es 21 días
antes, T0 es el día del vivo y T+3 son 3 días después.

| Fase | Tareas (y cuándo vencen) |
|---|---|
| Fase 0 · Estrategia | Definir la promesa y a quién le habla la clase (T-30) · Definir la oferta del final y su precio (T-28) · Cargar la proyección del webinar (T-27) |
| Fase 1 · Landing y registro | Escribir la landing y las preguntas de calificación (T-24) · Conectar el píxel y probar los eventos (T-22) · Crear el grupo de WhatsApp y cargar el link (T-21) · Probar el registro de punta a punta (T-20) |
| Fase 2 · Mails y recordatorios | Secuencia de confirmación en el email marketing (T-19) · Recordatorios de 24 h, 1 h y "estamos en vivo" (T-17) · Video para la página de gracias (T-15) |
| Fase 3 · Anuncios | Grabar los creativos (T-21) · Armar las campañas con UTM (T-18) · Lanzar los anuncios (T-14) |
| Fase 4 · Captación | Revisar costo por registro y calificados cada día (T-10) · Contenido orgánico de la semana del vivo (T-7) · Ajustar presupuesto según el costo por registro (T-3) |
| Fase 5 · Presentación | Guion de la clase y de la oferta (T-10) · Ensayo completo (T-3) · Prueba técnica de la plataforma de transmisión (T-1) |
| Fase 6 · El vivo | Abrir la sala 15 minutos antes (T0) · Cargar la asistencia en el Inicio (T+1) |
| Fase 7 · Cierre y seguimiento | Llamar a las agendas en menos de 24 h (T+1) · Seguimiento a los que no agendaron (T+2) · Cargar ventas y planes de pago en Ventas (T+3) · Revisión: qué funcionó y qué no (el último día de la ventana de cierre: T+10 si no la cambiaste) |

Para manejarla:

- Una tarea se marca con su casilla y se saca con la ×.
- Abajo de todo agregás tareas propias, con su fase y su fecha.
- Arriba ves cuántas hiciste y cuántas se vencieron.
- Si creás el webinar con menos de 30 días por delante, las tareas con fecha anterior a hoy aparecen vencidas desde
  el principio (por ejemplo, a 14 días del vivo son 12, de T-30 a T-15). Tildá las que ya hiciste y sacá con la ×
  las que no van.
- Los closers la ven, pero no la pueden tocar.

En la sección 7.1 está la misma lista ordenada por día, con la pantalla donde se hace cada tarea.

### 4.4 La proyección

La proyección es la cuenta al revés de tu webinar: con tus supuestos, calcula cuántos registros, agendas y ventas
salen, y cuántos closers necesitás. Se carga en **Ajustes → Webinar → Proyección** y los números se recalculan mientras
escribís. «Guardar proyección» la deja fija.

Estos son los 11 supuestos. Los que traen un número son **valores de referencia de la app**. No son datos de mercado
ni de tu negocio: cambialos por los tuyos. Lo mejor es usar las tasas reales de tus webinars anteriores, que ves en
Funnel.

| Supuesto | Valor de referencia de la app |
|---|---|
| Presupuesto de ads | ninguno: cargá el tuyo |
| Registros objetivo | ninguno: cargá el tuyo |
| % calificados | 30 |
| % que se conecta al vivo | 25 |
| % de registros que agenda | 3 |
| % show-up | 65 |
| % de cierre | 20 |
| Ticket (cash por venta) | ninguno: cargá el tuyo |
| ROAS objetivo | 3 |
| Llamadas por closer por día | 7 |
| Días de llamadas | 4 |

Un campo vacío usa el valor de referencia, que aparece en gris adentro del campo.

Lo que calcula:

- **Costo por registro** = presupuesto ÷ registros.
- **Calificados** = registros × % calificados. **CPL calificado** = presupuesto ÷ calificados.
- **Asistentes al vivo** = registros × % que se conecta.
- **Agendas** = registros × % que agenda. **Costo por agenda** = presupuesto ÷ agendas.
- **Llamadas presentadas** = agendas × % show-up.
- **Ventas** = llamadas × % de cierre.
- **Cash** = ventas × ticket. **ROAS** = cash ÷ presupuesto.
- **Cash objetivo** = presupuesto × ROAS objetivo. **Ventas para llegar** = cash objetivo ÷ ticket, redondeado para
  arriba.
- **Closers necesarios** = agendas ÷ (llamadas por closer × días de llamadas), redondeado para arriba.

Las cantidades (calificados, asistentes, agendas, llamadas y ventas) se redondean al entero más cercano, y cada paso
sale del anterior ya redondeado. Así las cuentas cierran con lo que ves en la pantalla: el cash es siempre las ventas
que se muestran por el ticket.

Con los números de la demo (presupuesto 1.800, 1.400 registros, ticket 900 y el resto en los valores de referencia),
la cuenta da 42 agendas y 2 closers necesarios. De esas agendas salen 27 llamadas (42 × 65 % = 27,3) y 5 ventas
(27 × 20 % = 5,4), o sea un cash de 4.500 (5 × 900). Es una cuenta con supuestos, no una promesa.

La proyección es el objetivo contra el que se comparan el Inicio, KPIs, Funnel y Ads: no hay otro lugar donde cargar
objetivos del webinar. Los mínimos del equipo y el objetivo del mes del CRM son aparte: se cargan en Ventas →
Leaderboard → «Editar mínimos».

### 4.5 La landing

Se edita en **Captación → Landing**. Lo que cambies se aplica al webinar elegido en el selector, y la landing muestra
el que está «En la landing». Al guardar, el cambio aparece en menos de un minuto. Los botones «Ver landing» y «Ver
gracias» abren las páginas.

| Bloque | Qué cargás |
|---|---|
| Arriba de todo | Etiqueta, texto de los botones, titular, bajada y la frase de debajo del botón. En el titular, lo que va entre `*asteriscos*` sale en el color de tu marca. |
| Lo que van a ver | El título de la sección, hasta 4 piezas (una por línea, `título \| texto`) y un regalo solo para los que estén en vivo (título y texto). |
| Para quién | A quién le sirve y a quién no, uno por línea. |
| Quién da la clase | Nombre, foto (un link que empiece con `https://`), historia y hasta 4 números. Poné solo números reales y comprobables. Antes de pegar la foto, abrí el link en el navegador: tiene que mostrar solo la imagen (por ejemplo, terminar en `.jpg`, `.png` o `.webp`). Si no, la landing muestra un recuadro vacío. |
| Preguntas frecuentes y cierre | Hasta 8 preguntas (`pregunta \| respuesta`), el título del cierre y el aviso legal de resultados. La pregunta «¿A qué hora es en mi país?» se agrega sola. |
| Página de gracias | El link del grupo de WhatsApp, un video (YouTube, Vimeo, Wistia, Loom o un `.mp4`) y el paso del mail, que es opcional. |
| Preguntas de calificación | El paso 2 del formulario (abajo). |

Los links tienen que empezar con `https://`. Si no, la app no guarda y te avisa.

**Las preguntas de calificación.** Podés tener hasta 3 preguntas, cada una con hasta 8 opciones, una por línea. Una
opción con `*` adelante es una opción que **califica**. Por ejemplo:

```
Nada por ahora
Menos de 500
* 500 a 1.000
* Más de 1.000
```

Un registro queda **calificado** cuando, en cada pregunta que tiene opciones marcadas, eligió una marcada. Si ninguna
pregunta tiene opciones marcadas, nadie se marca como calificado ni como no calificado. Lo que define una calificada
lo decidís vos según tu oferta: la app no sabe qué cliente te sirve.

Con esa marca:

- la tabla de Registros muestra quién calificó;
- el Inicio, KPIs y Funnel cuentan los calificados;
- si conectaste el píxel, Meta recibe un evento aparte (CompleteRegistration) solo por los calificados, para optimizar
  los anuncios.

El criterio no se publica: la landing muestra las preguntas, pero no cuáles opciones califican.

Si cambiás el texto de una pregunta con la campaña andando, mantené la misma cantidad de preguntas. Así las
respuestas que ya entraron siguen contando para esa pregunta.

### 4.6 El grupo de WhatsApp y el calendario

- **Grupo de WhatsApp:** pegá el link en Landing → Página de gracias. Un grupo admite hasta 1.024 personas: cuando se
  llena, creá otro y cambiá el link en el mismo lugar (la app no rota grupos sola). Si no cargás ningún link, la página
  de gracias dice «Tu lugar está reservado» y no muestra el paso del grupo.
- **El calendario (`.ics`):** no hay que configurar nada. La página de gracias lo arma sola con la fecha y la hora del
  webinar, su duración, el titular (sin los asteriscos) y el link del grupo en la descripción. Trae avisos 1 hora y
  10 minutos antes, y cada persona lo ve en su propia hora.
- La página de gracias siempre muestra el webinar que está **en la landing**. Por eso no cambies el webinar activo
  mientras sigas juntando registros para otro.

---

## 5. Conectá tus herramientas

Todas son opcionales: sin ninguna, la app anda con lo que cargues a mano. Cada una se conecta de una de estas dos
formas:

- **En la pantalla Integraciones** (la más fácil): tocás la tarjeta y después «Conectar». El cuadro te muestra los pasos
  y un link a donde se saca la clave. Pegás la clave y tocás «Conectar»: la app la prueba sola. Si hace falta, elegís
  de una lista (la cuenta, el píxel, el equipo o la lista de mails) y tocás «Guardar y probar». La clave queda cifrada
  en tu base, y en la pantalla solo se ven sus últimos 4 caracteres.
- **Con variables de entorno en Netlify** (después de cargarlas hay que volver a desplegar).

**Si están las dos, manda lo que guardaste en Integraciones**, campo por campo. «Desconectar» borra lo guardado. Si
además hay una variable, la integración sigue conectada con la variable, y el cuadro te lo dice.

> Pegá cada credencial **solo** en la pantalla Integraciones o en las variables de Netlify. Nunca en un chat, un mail
> ni el repositorio.

### Meta Ads

- **Qué habilita:**
  - la pantalla Ads completa;
  - el gasto en el Inicio, KPIs, Funnel y Finanzas;
  - el costo por registro y por registro calificado;
  - qué campaña y qué anuncio trajo cada registro, por sus UTM.
- **Qué necesitás:**
  - **una app de Meta de tu negocio.** Meta genera el token solo si el usuario del sistema tiene una app asignada. Si
    no tenés una: entrá a developers.facebook.com → **Mis apps** → **Crear app**, elegí el tipo **Empresa**
    (Business) y asociala a tu portfolio comercial (tu Business Manager). No hace falta programar nada en la app:
    solo tiene que existir;
  - un **token de un usuario del sistema** de tu Business Manager, con el permiso **`ads_read`** (alcanza para leer:
    la app nunca escribe en Meta). Los pasos del cuadro son:
    1. En Configuración del negocio → **Usuarios del sistema**, creá uno con rol **Administrador**.
    2. En ese usuario, **Asignar activos**: dale la cuenta publicitaria, el píxel (en Meta también se llama conjunto
       de datos) y, en **Apps**, la app del punto anterior.
    3. Tocá «Generar token». Cuando te pida una app, elegí esa. Marcá `ads_read` y copiá el token;
  - la cuenta publicitaria y el píxel. Los elegís de la lista después de pegar el token.
- **Dónde se pega:** Integraciones → Meta, o las variables `META_TOKEN`, `META_CUENTA` (con la forma
  `act_<número>`), `META_PIXEL` y, si hace falta, `META_API_VERSION` (por defecto `v26.0`).
- **Cómo sabés que quedó bien:**
  - la tarjeta dice «Conectada» con el nombre de la cuenta, la moneda y el píxel. Si la cuenta de Meta usa otra zona
    horaria que tu negocio, te lo avisa: Meta corta los días en su zona;
  - en Ads → Dashboard aparece el gasto, y en el Feed, los anuncios;
  - si la tarjeta dice «Falta un paso», te falta elegir la cuenta o el píxel.
- Si la cuenta de Meta factura en otra moneda que tu negocio, en Ads se carga el tipo de cambio a mano.

### El píxel y la Conversions API (CAPI)

- **Qué habilita:**
  - la landing carga el píxel en el navegador;
  - el servidor manda los mismos eventos por la Conversions API: **Lead** por cada registro y
    **CompleteRegistration** solo por los calificados. Van con el mismo id de evento, para que Meta no cuente dos veces;
  - si un envío falla, se reintenta solo hasta 4 veces, cada vez más espaciado: a los 10 minutos, 30 minutos, 2 horas
    y 6 horas. Meta no acepta eventos de más de 7 días, así que esos se descartan.
- **Qué necesitás:** un token que pueda **mandar** eventos. `ads_read` solo alcanza para leer, así que hay dos
  caminos:
  - **El más simple:** un token propio de la Conversions API. En el Administrador de eventos → tu píxel →
    **Configuración** → la parte **Conversions API** → **Generar token de acceso** (Meta arma sola la app y el
    usuario del sistema; ese link solo lo ve alguien con permisos de desarrollador del negocio). Cargalo en la variable
    `META_CAPI_TOKEN` en Netlify y volvé a desplegar. Este va **solo** por variable, y la app lo usa nada más que para
    mandar los eventos.
  - **El mismo token de Integraciones:** sirve si el usuario del sistema tiene el píxel asignado y si, al generar el
    token, marcaste también **`ads_management`**. Con ese permiso la app igual no cambia nada en tus anuncios.
  - Si al token le falta el permiso, «Mandar evento de prueba» (abajo) muestra el aviso de error que devuelve Meta, en
    inglés, y suele traer la palabra `permission`. En ese caso, usá el primer camino.
- **Dónde se pega:** elegís el píxel en Integraciones → Meta (o con `META_PIXEL`).
- **Cómo sabés que quedó bien:**
  1. Abrí Integraciones → Meta → «Probar el píxel (opcional)».
  2. Pegá el código de «Eventos de prueba», que sale del Administrador de eventos → tu píxel → Eventos de prueba, y
     tocá «Mandar evento de prueba». El evento aparece en esa pestaña de Meta.
  3. Hacé un registro de prueba en tu landing. En Registros, la columna Meta tiene que mostrar ✓. Si muestra ✗, el
     error aparece al pasar el mouse.
  4. **Tocá «Salir del modo prueba» antes de prender los anuncios.** Mientras el código de prueba está cargado, los
     registros reales no cuentan para tus campañas. La app te lo recuerda con un aviso en Webinar y en Integraciones.

### Calendly o iClosed (las agendas)

Conectá el que uses: los dos hacen lo mismo.

- **Qué habilita:**
  - las llamadas agendadas entran solas a Llamadas: cada 15 minutos, o al momento con «Sincronizar»;
  - cada agenda llega con nombre, mail, WhatsApp, fecha, hora, closer y las respuestas del formulario de agenda. La
    app reconoce preguntas sobre capital, negocio, facturación, objetivo, traba, urgencia y decisor;
  - si la reserva trae UTM, también llegan;
  - una llamada cancelada en el calendario pasa a «Cancelada», una sola vez: si tu equipo la reabre, queda reabierta;
  - la app nunca pisa lo que tu equipo cargó a mano: estado, monto, notas, programa.
  - Calendly trae las llamadas de 30 días atrás a 60 días adelante, y trae **todas** las reuniones de la
    organización, de cualquier tipo de evento. Si usás Calendly también para otras cosas (reuniones con alumnos o del
    equipo), van a entrar como agendas y a sumar en las métricas. En Llamadas → Agendas podés mirar un solo tipo de
    evento con el selector «Todos los pipelines» (y en Pipeline, con el filtro de Evento), pero las métricas cuentan
    todas: lo más limpio es usar para las ventas una organización de Calendly aparte. Si se cuela una reunión que no
    es de venta, sacala en Pipeline con «Borrar card»: la sincronización no la vuelve a traer.
- **Qué necesitás:**
  - **Calendly:** un token personal de acceso de un admin de la organización, así ve las agendas de todos los closers.
    Sale de Integraciones → API y webhooks → Generar token.
  - **iClosed:** una API key de la cuenta admin. Sale de Settings → Developer → API Keys, y se muestra una sola vez.
- **Dónde se pega:** Integraciones → Calendly o iClosed, o las variables `CALENDLY_TOKEN` o `ICLOSED_API_KEY`.
- **Cómo sabés que quedó bien:**
  - la tarjeta dice «Conectada» (en Calendly, con el nombre del usuario);
  - en Llamadas → Agendas, tocá «Sincronizar»: las llamadas aparecen;
  - en la tarjeta de conexiones del menú aparece «Calendarios».
- **Importante:** el nombre de cada closer en Equipo tiene que ser **igual** al que tiene en Calendly o iClosed. Así
  la app sabe qué llamada es de quién.

### Fathom

- **Qué habilita:** en esta versión, **solo la conexión**. El análisis de las grabaciones aparece marcado como «más
  adelante» en Análisis, Agendas y Llamadas, y todavía no trae datos.
- **Qué necesitás:** una API key de un admin del equipo de ventas (Settings → API Access) y elegir el equipo de los
  closers.
- **Dónde se pega:** Integraciones → Fathom, o las variables `FATHOM_API_KEY` y `FATHOM_EQUIPO`.
- **Cómo sabés que quedó bien:** la tarjeta dice «Equipo» y el nombre que elegiste (mirá también la sección 8).

### ActiveCampaign

- **Qué habilita:** cada registro nuevo entra como contacto (email, nombre y teléfono) a la lista que elijas, con la
  etiqueta del webinar. Esa etiqueta es la que dispara tu automatización de mails, que armás vos en ActiveCampaign. Si
  un envío falla, se reintenta solo.
- **Qué necesitás:** la URL de la API (con la forma `https://<tu-cuenta>.api-us1.com`) y la key. Están en
  ActiveCampaign → Configuración → Desarrollador.
- **Dónde se pega:** Integraciones → ActiveCampaign (la URL, la key y después la lista), o las variables `AC_URL`,
  `AC_KEY` y `AC_LISTA`. La etiqueta se cambia en Webinar → Datos del webinar → «Etiqueta en ActiveCampaign».
- **Cómo sabés que quedó bien:**
  - la tarjeta dice «Lista» con el nombre de la lista;
  - después de un registro de prueba, en Registros la columna AC muestra ✓;
  - en ActiveCampaign, el contacto aparece en la lista con la etiqueta.
- **La automatización, en cada webinar:** en ActiveCampaign, **Automatizaciones** → nueva automatización → el
  disparador **Se agrega una etiqueta** → la etiqueta del webinar (`webinar-AAAA-MM-DD`). Cada webinar nuevo trae su
  propia etiqueta, con su fecha: cuando crees el siguiente, cambiá el disparador por la etiqueta nueva, o poné la misma
  etiqueta de antes en Webinar → Datos del webinar → «Etiqueta en ActiveCampaign».

### Claude (el ICP con IA)

- **Qué habilita:** en ICP, el botón «Armar perfiles». Claude arma de 2 a 6 perfiles de comprador, y cuántas personas
  cumple cada perfil lo cuenta la app. Cada pedido gasta crédito de tu cuenta de Anthropic.
- **Qué le manda la app a Claude:**
  - cuántas personas eligieron cada respuesta, y cuántas de ellas agendaron, se presentaron y compraron;
  - hasta 300 textos libres de los campos Objetivo y Traba del formulario de agenda. Antes de mandarlos, tapa los
    mails, teléfonos, links y @usuarios.
  - Nunca manda nombres, mails ni teléfonos de los registros.
- **Qué necesitás:** una API key de la consola de Anthropic (API Keys → Create Key). La consola es aparte de una
  suscripción a Claude.ai y se paga por uso: antes, cargá crédito en **Billing**. Sin crédito, la clave conecta igual,
  pero «Armar perfiles» da error.
- **Dónde se pega:** Integraciones → IA (Claude), o la variable `ANTHROPIC_API_KEY`. El modelo se cambia con
  `ICP_MODELO` (por defecto `claude-opus-5-5`).
- **Cómo sabés que quedó bien:**
  - la tarjeta dice «Lista para el ICP» con el modelo;
  - en ICP aparece «Armar perfiles». El armado corre de fondo y el resultado aparece al rato.

---

## 6. El equipo y los roles

| Rol | Qué ve | Qué puede hacer y qué no |
|---|---|---|
| **Equipo** | Las 20 pantallas | Todo, incluido crear accesos de cualquier rol. |
| **Cliente** | Las 20 pantallas | Lo mismo que Equipo, salvo en la pantalla Equipo: no puede sumar a alguien con rol Equipo ni cambiarle el código o darlo de baja. |
| **Closer** | Llamadas (Métricas, Agendas, Análisis, Pipeline, Llamadas y Pre-call), Ventas y la ficha del Webinar | **Llamadas:** ve todas las agendas (las métricas y el leaderboard las necesitan), pero solo cambia las suyas o las que no tienen closer. Solo puede tocar el estado, el monto, el gatillo, las notas, el programa y el closer, y el closer solo lo puede poner en su nombre o dejarlo vacío. **Ventas:** ve solo sus registros, aunque el leaderboard es de todo el equipo. Carga ventas y cierres del mes anterior, del actual y del siguiente, y no puede borrar. **Análisis:** puede leer las evaluaciones, pero no evaluar. **Webinar:** mira la ficha sin tocarla. No ve Captación, Finanzas, KPIs, Integraciones ni Equipo. |

Esconder una pantalla no es lo único que los protege: el servidor vuelve a revisar el rol en cada pedido.

**Dar acceso a alguien** (Ajustes → Equipo):

1. En «Dar acceso», escribí su nombre y apellido y elegí el rol.
2. Tocá «Crear y ver su código». El código aparece **una sola vez**.
3. Tocá «Copiar mensaje para WhatsApp» y mandáselo por privado. La persona entra en `tu-sitio.netlify.app/app` con ese
   código.

Para un closer, escribí el nombre **igual** que en Calendly o iClosed.

**Dar de baja:** tocá «Dar de baja» en su fila. Su código deja de andar al instante y se cierran sus sesiones. Nadie se
puede dar de baja a sí mismo. Para devolverle el acceso, «Reactivar» le genera un código nuevo.

**Si alguien pierde su código:** tocá «Código nuevo» en su fila. El viejo deja de andar. Si el que lo perdió sos vos y
no queda nadie del equipo que pueda entrar, usá el script de la sección 3.6.

---

## 7. Cómo operar tu webinar día por día

### 7.1 El calendario, de T-21 a T+7

Estas son las tareas reales de la checklist, con la pantalla donde se hace cada una. T0 es el día del vivo. La primera
y la última fila juntan las tareas que caen fuera de la ventana de T-21 a T+7.

| Día | Tarea de la checklist | Dónde se hace |
|---|---|---|
| Antes de T-21 | T-30 «Definir la promesa y a quién le habla la clase» · T-28 «Definir la oferta del final y su precio» · T-27 «Cargar la proyección del webinar» · T-24 «Escribir la landing y las preguntas de calificación» · T-22 «Conectar el píxel y probar los eventos» | La promesa y la oferta, fuera de la app. Cargá el programa y su precio en Ventas → Programas. La proyección, en Webinar → Proyección. La landing, en Landing. El píxel, en Integraciones → Meta → Probar el píxel. |
| T-21 | «Crear el grupo de WhatsApp y cargar el link» · «Grabar los creativos» | El link, en Landing → Página de gracias. Los creativos, fuera de la app; si querés ordenar las campañas, usá Ads → Planificar. |
| T-20 | «Probar el registro de punta a punta» | Registrate en tu landing (`/`), seguí hasta `/gracias` y buscate en Registros. |
| T-19 | «Secuencia de confirmación en el email marketing» | En tu herramienta de mails. Revisá Integraciones → ActiveCampaign y la etiqueta en Webinar. |
| T-18 | «Armar las campañas con UTM» | UTM's → el armador de links, con la plantilla «Meta Ads (automático)». |
| T-17 | «Recordatorios de 24 h, 1 h y "estamos en vivo"» | En tu herramienta de mails y en el grupo de WhatsApp. |
| T-15 | «Video para la página de gracias» | Landing → Página de gracias → Video. |
| T-14 | «Lanzar los anuncios» | En Meta. Antes, sacá el modo prueba del píxel (Integraciones → Meta). Después, seguilo en Ads → Dashboard. |
| T-10 | «Revisar costo por registro y calificados cada día» · «Guion de la clase y de la oferta» | Todos los días: Inicio, Registros, Ads → Dashboard y UTM's. El guion, fuera de la app. |
| T-7 | «Contenido orgánico de la semana del vivo» | UTM's → armador: un link por historia, bio o mail, para saber qué trajo cada registro. |
| T-3 | «Ajustar presupuesto según el costo por registro» · «Ensayo completo» | Ads → Dashboard y Feed, KPIs → Captación. El ensayo, fuera de la app. |
| T-1 | «Prueba técnica de la plataforma de transmisión» | Fuera de la app. Mirá también que la landing muestre bien la cuenta regresiva. |
| T0 | «Abrir la sala 15 minutos antes» | Tu plataforma de transmisión. La landing deja registrarse hasta que termina la clase. |
| T+1 | «Cargar la asistencia en el Inicio» · «Llamar a las agendas en menos de 24 h» | La asistencia, en Inicio → Asistentes al vivo → Cargar. Las llamadas, en Llamadas → Pre-call, Agendas y Llamadas. |
| T+2 | «Seguimiento a los que no agendaron» | En Registros: la tabla tiene el WhatsApp de cada persona. También en tu herramienta de mails. |
| T+3 | «Cargar ventas y planes de pago en Ventas» | Ventas → Cargar cierre. Las cuotas se siguen en Ventas → Cuotas y en Finanzas. |
| Después de T+7 | T+10 «Revisión: qué funcionó y qué no» (el último día de la ventana de cierre: si la cambiaste, cae ese día) | Funnel → Embudo y Comparador, KPIs, ICP y UTM's → Trazabilidad. |

### 7.2 Antes del vivo: la captación

- **Inicio:** el semáforo de la salud del webinar te dice si vas atrás del ritmo en registros, anuncios, agendas,
  closing o cash, comparado con tu proyección y con lo que ya debería haber a hoy.
- **Ads:** en Dashboard mirás el gasto, el costo por registro y el costo por registro calificado contra el objetivo. En
  Feed, cada anuncio con su costo por resultado. En Calendario, qué se lanzó cada día. En Planificar llevás un
  tablero propio de campañas (Planificada, En Revisión, Activa, Pausada), que podés vincular con las campañas de Meta.
- **Registros:** cuántos entraron hoy y en total, cuántos calificaron, de qué fuente vienen y si los envíos a
  ActiveCampaign y a Meta salieron bien. Lo que falló se reintenta solo.
- **UTM's:** registros, calificados, agendas, presentadas, compras y cash por fuente, campaña y anuncio. Para que esto
  funcione, cada link que publiques tiene que llevar UTM: armalos en el armador de esta pantalla. En los anuncios de
  Meta, la plantilla «Meta Ads (automático)» usa las variables de Meta para el nombre de la campaña y del anuncio. Pegá
  el link en el campo de la URL del sitio web del anuncio. Un registro se asigna a una campaña cuando su UTM de
  campaña o de contenido coincide con el nombre o el id de la campaña o de uno de sus anuncios.
- **Landing:** ajustá textos sin tocar nada técnico. Los cambios salen en menos de un minuto.
- **Webinar:** tildá la checklist a medida que avanzás.

### 7.3 El día del vivo

- La landing sigue tomando registros mientras dura la clase («La clase ya empezó: registrate y entrá por el grupo»).
  Cuando termina, cierra sola.
- **La asistencia se carga a mano:** la plantilla no la lee de tu plataforma de transmisión. Al terminar, andá a
  Inicio → Asistentes al vivo → «Cargar» (o tocá la tarjeta en KPIs → Captación) y poné cuántas personas estuvieron.
  Con ese número se calcula el porcentaje de registros que se conectaron.
- **El pop-up:** si hacés una sesión de venta aparte, su fecha y su hora quedan en la ficha del webinar, y el Inicio
  cuenta el gasto de anuncios hasta ese día. No tiene una landing aparte.

### 7.4 Después del vivo: llamadas, ventas y números

- **Llamadas → Pre-call:** antes de cada llamada, el closer ve lo que el lead contestó al agendar y en la landing (de
  qué anuncio vino, si calificó y qué respondió).
- **Llamadas → Agendas y Llamadas:** el calendario y el tablero del día, con las llamadas que no tienen closer. Las
  agendas llegan solas de Calendly o iClosed. Si no, cargalas con «Agendar llamada» o «Importar» (un CSV con
  encabezados: Nombre y Fecha son obligatorios; WhatsApp, Email, Hora, Capital, Origen, Closer, Setter e Instagram si
  los tenés; hasta 100 por vez).
- **Llamadas → Pipeline:** las agendas por estado: Pendiente, Confirmada, Re-agenda, Presentada, No-show, Cerrada,
  Cancelada y Descalificada. Al pasar una a «Cerrada», la fecha de cierre se completa sola.
- **Llamadas → Análisis:** evaluá las llamadas presentadas con la rúbrica, para entrenar al equipo.
- **Llamadas → Métricas:** tasa de asistencia, tasa de cierre y cash por closer. Las llamadas que ya pasaron y no
  tienen resultado se cuentan aparte, como «sin cargar».
- **Ventas:**
  - cada cierre se carga **una vez** con «Cargar cierre», como plan de pagos: de ahí salen la venta y sus cuotas, y un
    mensaje listo para copiar. El programa y su precio salen del catálogo de «Programas»;
  - «Llamadas sin cargar» te muestra las agendas que ya pasaron y todavía no tienen venta;
  - al guardar una venta, el pipeline se actualiza: la llamada queda Presentada, No-show o Cerrada, con su monto;
  - en Cuotas cobrás una cuota con un toque y traés las pendientes del mes anterior;
  - el Leaderboard ordena a los closers por cash. Con «Editar mínimos» cargás los mínimos del equipo y el objetivo
    del mes.
- **Finanzas:**
  - el Resumen muestra facturación, cash cobrado, gasto en anuncios, ROAS y lo que falta cobrar. La **facturación**
    es lo que pagaron las ventas nuevas en el período, no el precio total de lo vendido: un cierre de 1.000 en dos
    pagos de 500 factura 500. La segunda cuota queda en «Cuentas por cobrar» hasta que la cobrás, y ahí suma al cash
    (no a la facturación);
  - en Ventas → Pagos pendientes marcás cada cuota como cobrada o «no paga»;
  - en Liquidaciones se calcula la comisión de cada closer y marcás cuándo le pagaste. La app arranca con un 10 %
    para todos: es un valor por defecto, cambialo por el que acuerdes con cada closer.
- **KPIs:** las tarjetas por área contra la proyección, con una barrita que marca el ritmo esperado a hoy. Con la
  chinche fijás las que quieras ver en el Inicio, y las ve todo el equipo.

### 7.5 Comparar con el webinar anterior

Entrá a **Conversión → Funnel**.

- **Embudo:** el webinar elegido, paso por paso: inversión, registros, calificados, asistentes, agendas, presentadas,
  cierres y cash. Cada paso tiene su conversión al lado de la que proyectaste y el cuello de botella marcado. Abajo, el
  mismo embudo abierto por fuente.
- **Comparador:** tus webinars lado a lado (agendas, show-up, cierres y cash dentro de su ventana de cierre). Si uno
  sigue abierto, la comparación es a igual cantidad de días.

Con esas tasas reales, cargá la proyección del webinar siguiente: queda más cerca de lo que de verdad te pasa.

### 7.6 Cuando termina, el siguiente

1. Creá el webinar nuevo en Webinar → «＋ Nuevo webinar». Copia la landing del que está activo.
2. Revisá los textos y la fecha en Landing.
3. Cuando lo quieras publicar, tocá «Usar en la landing».

Los webinars viejos quedan guardados con sus números para compararlos.

---

## 8. Problemas comunes y límites conocidos

### Lo que puede pasar y qué hacer

| Lo que ves | Qué pasa | Qué hacés |
|---|---|---|
| «Falta configurar SESION_SECRETO» | La variable no está en Netlify o tiene menos de 32 caracteres. | Cargala (sección 3.4) y volvé a desplegar. |
| «Falta configurar Supabase…» | Falta `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`, o cargaste `ALMACEN=archivo` en Netlify. | Revisá las dos variables, borrá `ALMACEN` y volvé a desplegar. `ALMACEN=archivo` solo sirve en tu compu. |
| Un error que empieza con «Base: 404» | La base no tiene las funciones del archivo `schema.sql`, o tiene una versión vieja. | Volvé a ejecutar `supabase/schema.sql` entero en el SQL Editor. No borra datos. |
| Cambiaste una variable y no pasó nada | Netlify toma las variables nuevas recién en el deploy siguiente. | Volvé a desplegar. |
| «Código inválido o dado de baja» | El código está mal escrito, la persona está de baja o se cambió `SESION_SECRETO`. Con `CODIGO_INICIAL`: ya hay alguna persona en la base, aunque esté de baja. | Generá un código nuevo en Equipo, o con el script de la sección 3.6 si no entra nadie. |
| «Demasiados intentos. Probá de nuevo en unos minutos.» | Hubo 10 códigos equivocados desde esa conexión en 15 minutos. | Esperá 15 minutos. |
| La landing (o `/gracias`) dice «No hay una clase abierta en este momento.» | No hay ningún webinar en la landing. | Webinar → «Usar en la landing». |
| La landing no muestra un cambio | La landing se guarda en caché un minuto. | Esperá un minuto y recargá. |
| Las campañas no reciben los registros | El píxel está en modo prueba. | Integraciones → Meta → «Salir del modo prueba». |
| Las claves de Integraciones dejaron de andar | Cambiaste `SESION_SECRETO` sin tener `CIFRADO_SECRETO`, o cambiaste `CIFRADO_SECRETO`. | Volvé a conectarlas. |
| Un closer no ve sus números o sus agendas | Su nombre en Equipo no es igual al de Calendly o iClosed. | Hacé que coincidan (dalo de baja y crealo con el nombre correcto, o cambiá el nombre en el calendario). |
| La landing dice «Demasiados intentos desde esta conexión» | Hubo más de 20 registros en una hora desde la misma conexión (por ejemplo, una oficina con una sola conexión). | Si es normal para tu público, subí `REGISTRO_LIMITE_HORA`. |
| Alguien perdió su código | — | Equipo → «Código nuevo». Si sos vos y no queda nadie con rol Equipo, sección 3.6. |

### Límites conocidos

- **El tamaño de las respuestas (6 MB).** Netlify no deja que una función responda más de 6 MB, y algunas pantallas
  piden todo junto:
  - el pipeline de Llamadas (`/api/panel`) llega a ese tope cerca de las **6.700 agendas** (antes, si el navegador lo
    acepta, la respuesta sale comprimida);
  - ICP y UTM's (`/api/icp`), cerca de las **17.900 personas** en el pipeline;
  - la tabla de Registros, cerca de los 20.000 registros por webinar.

  Si te acercás, hay que archivar las agendas viejas en otra colección de la base o, en una versión futura, paginar
  esas pantallas.
- **Las tareas programadas van en hora UTC.** Netlify corre la sincronización de agendas cada 15 minutos y los
  reintentos de envíos cada 10, siempre en UTC. Como van por intervalo, la zona no cambia nada. Si algún día las
  pasás a una hora fija, contá en UTC: las 20:00 de Argentina son las 23:00 UTC. Solo corren en el deploy publicado,
  no en las vistas previas.
- **Las cancelaciones de iClosed.** No hay documentación pública que diga cómo marca iClosed una llamada cancelada. La
  app busca la palabra «cancel» en sus campos de estado. Confirmalo con una cancelación de prueba. Si una llamada
  cancelada sigue como Pendiente, cambiala a mano en el Pipeline.
- **La respuesta de Fathom.** La forma de la lista de equipos de Fathom no está confirmada con una cuenta real. Si al
  conectar ves «Fathom respondió algo inesperado», conectala por variables: `FATHOM_API_KEY` y `FATHOM_EQUIPO` con el
  nombre del equipo de los closers. En esta versión Fathom no trae datos, así que no se pierde nada.
- **`ALMACEN=archivo` no sirve en Netlify.** Allá el disco no guarda nada, así que cada pedido da «Falta configurar
  Supabase». Es solo para probar en tu compu.
- **Meta, la primera vez.** Que la app traiga bien las campañas y los anuncios archivados o borrados no se probó con una
  cuenta real. Revisá el Feed la primera vez que conectes.
- **Algunos detalles de la landing y de la app:**
  - la pregunta automática «¿A qué hora es en mi país?» calcula los horarios desde el día de Argentina y nombra
    «Miami» para la hora del este de Estados Unidos;
  - en Ads → Planificar, el orden de las tarjetas dentro de una misma columna no se guarda (entre columnas sí);
  - al compartir el link de la landing en WhatsApp o Facebook, la vista previa no muestra los textos del webinar;
  - en Ventas, cambiar solo la «situación» de una venta no actualiza el pipeline: lo actualizan los cambios de
    asistencia, de cobro o un cierre.
- **La demo en Supabase.** Si cargás la demo en una base de Supabase, sus registros quedan con la fecha del día de la
  carga, porque esa fecha la pone la base. En tu compu se ven con sus fechas de mentira.
