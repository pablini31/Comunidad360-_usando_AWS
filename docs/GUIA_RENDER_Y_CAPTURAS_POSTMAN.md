# Guía Rápida: Despliegue en Render + Capturas en Pantalla Dividida (Postman + Dashboard)

Esta guía está diseñada para que completes tu despliegue en **Render.com** y tomes las **capturas de pantalla en pantalla dividida** (Dashboard a la izquierda + Postman a la derecha) requeridas en las **Fases 4, 5 y 6**.

---

## Parte 1 — Configuración en Render.com

1. **Conecta tu repositorio de GitHub (`Comunidad360-_usando_AWS`):**
   - En Render, selecciona **New + → Web Service** y elige tu repositorio.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
2. **Variables de Entorno (`Environment Variables` en Render):**
   Puedes usar el botón **"Add from .env"** en Render y pegar el contenido de tu archivo `.env` local (cambiando `NODE_ENV=production`). Asegúrate de que estén estas variables:
   - `NODE_ENV` = `production`
   - `DB_HOST` = *(el endpoint de tu RDS MariaDB en `us-east-2`)*
   - `DB_PORT` = `3306`
   - `DB_USER` = *(tu usuario de RDS)*
   - `DB_PASSWORD` = *(tu contraseña de RDS)*
   - `DB_NAME` = `community360`
   - `DB_SSL` = `true`
   - `AWS_REGION` = `us-east-2`
   - `AWS_ACCESS_KEY_ID` = *(tu Access Key de AWS)*
   - `AWS_SECRET_ACCESS_KEY` = *(tu Secret Key de 40 caracteres)*
   - `DYNAMO_TABLE_INTERACCIONES` = `community360_interacciones`
   - `DYNAMO_TABLE_CUARENTENA` = `community360_cuarentena`
   - `JWT_SECRET` = *(tu secreto JWT)*
   - `JWT_EXPIRES_IN` = `8h`
3. **Verificación de salud:**
   - Una vez desplegado, abre `https://TU-APP.onrender.com/health` y verás `{"status":"ok","service":"community360"}`.

---

## Parte 2 — Cómo Preparar tu Pantalla Dividida para las Capturas (Evidencia 2)

1. **Divide tu pantalla en Windows (`Win + Flecha Izquierda` y `Win + Flecha Derecha`):**
   - **Mitad Izquierda (Navegador):** Abre tu Dashboard (`https://TU-APP.onrender.com` o `http://localhost:3000`). Inicia sesión con tu cuenta de administrador.
     - Verifica que arriba a la derecha aparezca el indicador verde **`En vivo`** (significa que el WebSocket `socket.io` está conectado).
     - La interfaz se adapta automáticamente al ancho de media pantalla (los 4 KPIs principales y las gráficas de barras y dona quedan visibles de un vistazo).
   - **Mitad Derecha (Postman):**
     - Haz clic en **Import** en Postman y selecciona el archivo [`postman/Community360_Demo.postman_collection.json`](../postman/Community360_Demo.postman_collection.json).
     - En la pestaña **Variables** de la colección, configura `baseUrl` con tu URL de Render y `password` con tu contraseña de administrador.

---

## Parte 3 — Secuencia Exacta de Peticiones en Postman para tus Capturas

Ejecuta las peticiones de la colección en este orden mientras observas cómo cambia el Dashboard en vivo sin recargar la página (`F5`):

| Paso en Postman | Endpoint y Método | Qué cambia en vivo en el Dashboard (Mitad Izquierda) | Qué capturar en pantalla |
| :--- | :--- | :--- | :--- |
| **1. Login Administrador** | `POST /api/auth/login` | *(Guarda automáticamente el `token` JWT en Postman)* | Respuesta `200 OK` con el token JWT generado. |
| **2. Consultar histórico** | `GET /api/interacciones?limit=20` | Muestra la consulta histórica paginada desde DynamoDB. | Respuesta `200 OK` con la lista de interacciones y `nextCursor`. |
| **3. Crear interacción en vivo** | `POST /api/interacciones` (crea `I999999` en `Discord` con sentimiento `0.92` y `18` reacciones) | **Sin recargar:** el KPI **03 · ACTIVIDAD EN VIVO** sube de **`207` a `208`**, se recalcula el promedio de reacciones, sube la barra de `Discord` y la dona de `Publicación`, y aparece una notificación verde en la esquina. En la pestaña **ACTIVIDAD** aparece arriba la tarjeta de `@LunaArt1`. | **Captura estrella (POST):** Dashboard con `208` actividades + notificación toast + Postman mostrando `201 Created`. |
| **4. Modificar interacción (PUT)** | `PUT /api/interacciones/I999999` (cambia canal a `Instagram`, tipo a `comentario` y reacciones a `42`) | **Sin recargar:** se actualizan al instante las gráficas de **Canales** (`Instagram` sube) y **Tipos** (`Comentario` sube), el promedio de reacciones sube y la tarjeta en **ACTIVIDAD** cambia su texto y canal en vivo. | **Captura (PUT):** Dashboard con indicadores recalculados + Postman mostrando `200 OK`. |
| **5. Modificación parcial (PATCH)** | `PATCH /api/interacciones/I999999` (`reacciones_recibidas: 55`, `sentimiento: 0.98`) | **Sin recargar:** sube el promedio de reacciones y el ánimo dinámico en la tarjeta `04 · ÁNIMO DINÁMICO`. | **Captura (PATCH):** Dashboard actualizado + Postman mostrando `200 OK`. |
| **6. Eliminar interacción (DELETE)** | `DELETE /api/interacciones/I999999` | **Sin recargar:** el KPI **03 · ACTIVIDAD EN VIVO** regresa exactamente a **`207`**, la tarjeta desaparece del flujo y la base de datos en AWS queda limpia con sus conteos originales (`1,068` / `207` / `793`). | **Captura (DELETE):** Dashboard de vuelta en `207` + Postman mostrando `200 OK`. |

---

## Parte 4 — Dónde Generar tu PDF Técnico Final

- Abre en tu navegador: **`/documento-tecnico.html`** (por ejemplo `http://localhost:3000/documento-tecnico.html` o `https://TU-APP.onrender.com/documento-tecnico.html`).
- Ahí ya están redactadas todas las secciones de las **Fases 1 a 6** (comparativa SQL vs NoSQL, diagrama de arquitectura híbrida 3FN + DynamoDB, tabla de resultados ETL, ejemplo de anonimización, tabla de endpoints REST + WebSockets y las fórmulas matemáticas de los indicadores dinámicos).
- Haz clic en el botón **"Imprimir / Guardar como PDF"** arriba a la derecha o pega tus capturas de AWS y de pantalla dividida en los dos recuadros de evidencia al final del documento.
