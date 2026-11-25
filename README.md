# COMMUNITY 360

Dashboard de comunidad con API REST en Express, MariaDB en RDS con TLS y DynamoDB mediante AWS SDK v3. El proyecto usa CommonJS y sirve el frontend desde `public/` sin etapa de compilación. La aplicación no crea ni modifica el esquema existente.

## Requisitos

- Node.js 18 o posterior y npm.
- MariaDB configurado en el `.env` local mediante `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
- Acceso AWS mediante el proveedor estándar de credenciales del SDK (variables de entorno, perfil local o rol IAM) y `AWS_REGION=us-east-2`.
- Un `JWT_SECRET` propio de al menos 32 bytes para arrancar en modo normal/producción.

## Configuración inicial

1. Instala dependencias:

   ```sh
   npm install
   ```

2. Añade a tu `.env` existente las variables que aparecen en [`.env.example`](.env.example). No reemplaces las credenciales RDS/AWS que ya tengas. Sustituye los valores de ejemplo de `JWT_SECRET` y de las seis variables `SEED_*` por secretos propios; el seed rechaza los placeholders.

3. Crea o actualiza las dos cuentas iniciales:

   ```sh
   npm run seed:admin
   ```

   El seed valida username, correo y política de contraseña, usa bcrypt con 10 rondas y hace los cambios en una transacción. Si ya existen ambas cuentas con los mismos username/correo, actualiza sus hashes y roles de forma idempotente. Un conflicto de identidad aborta sin sobrescribir otra cuenta. No pases contraseñas como argumentos de shell.

4. Inicia el servidor:

   ```sh
   npm start
   ```

   Abre `http://localhost:3000`. El proceso verifica conexión a MariaDB antes de escuchar y cierra el pool y el cliente DynamoDB al recibir `SIGINT` o `SIGTERM`. En `NODE_ENV=development`, si falta `JWT_SECRET`, se genera un secreto efímero para esa ejecución; las sesiones dejan de servir al reiniciar.

## Verificación de integración

Con el servidor activo y las cuentas del seed configuradas en `.env`, ejecuta en otra terminal:

```sh
npm run verify:api
```

El script prueba login válido/inválido, permisos de analista, validaciones, conflicto de alias, resumen, mapa y cuarentena. Para proteger la base real, verifica que el padrón tenga los 1,068 usuarios esperados y que `U999999` no exista antes de crear el usuario temporal. Si el alta se interrumpe, comprueba el ID y elimina solo el registro que tenga el alias temporal de esa ejecución. Al finalizar confirma que el conteo original se restauró. No ejecutes dos verificaciones en paralelo.

Las credenciales de prueba se leen de `SEED_ADMIN_*` y `SEED_ANALYST_*` (o de variables `VERIFY_*` sobrescritas para una cuenta de prueba aparte). El host de prueba se puede cambiar con `VERIFY_API_URL`.

## API principal

Todas las rutas requieren `Authorization: Bearer <JWT>`, excepto `POST /api/auth/login`. Las escrituras de usuarios/interacciones/cuarentena y la administración de cuentas requieren rol `admin`; analistas tienen acceso de lectura.

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/auth/login` | Login con limitación de intentos |
| GET | `/api/auth/me` | Perfil autenticado |
| POST | `/api/auth/change-password` | Cambio de contraseña |
| GET, POST | `/api/admins` | Listar/crear cuentas |
| PATCH, DELETE | `/api/admins/:id/activo`, `/api/admins/:id` | Activar, desactivar o eliminar cuentas |
| GET | `/api/catalogos/ubicaciones` | Catálogos geográficos cacheados |
| GET | `/api/usuarios` | Búsqueda, filtros y paginación SQL (`page`, `limit` hasta 100) |
| GET | `/api/usuarios/export/csv` | Exportación filtrada con mitigación de CSV formula injection |
| GET | `/api/usuarios/:id` | Perfil SQL e interacciones DynamoDB |
| POST, PUT, DELETE | `/api/usuarios[/:id]` | CRUD y protección de ubicación por consentimiento |
| GET, POST | `/api/interacciones` | Consulta paginada y alta validada |
| GET | `/api/cuarentena` | Cuarentena paginada y filtrable |
| GET | `/api/cuarentena/:id` | Inspección de registro original |
| POST | `/api/cuarentena/:id/reprocesar` | Reprocesar vínculo con usuario válido |
| GET | `/api/analytics/resumen` | KPIs y métricas híbridas (TTL de 60 s) |
| GET | `/api/analytics/mapa` | Solo puntos de usuarios con consentimiento y coordenadas |
| GET | `/api/bitacora` | Auditoría ETL |

Las consultas DynamoDB usan `limit` (máximo 100) y `cursor` base64url. Los filtros `id_usuario`, `canal` y `motivo_rechazo` usan sus GSIs; las consultas sin clave usan scan paginado con límite. Los errores se responden como JSON `{ "error": "..." }` y validaciones incluyen `details`.

## Seguridad y datos

- `.gitignore` excluye `.env`, `node_modules/`, `data/`, logs y temporales; permite solamente `.env.example` entre los archivos `.env.*`.
- MariaDB usa un pool `mysql2/promise` con TLS (`rejectUnauthorized: false`) para compatibilidad con RDS.
- No se registran credenciales ni tokens. JWT exige secreto de 32 bytes fuera de desarrollo.
- Se fuerzan coordenadas, ciudad y ubicación de interacciones a `NULL`/ausente cuando no hay consentimiento. Las respuestas de interacciones y cuarentena vuelven a comprobar el consentimiento vigente.
- El mapa devuelve exclusivamente ciudad, país, coordenadas, estatus y sentimiento para registros autorizados.
- DynamoDB reintenta throttling con backoff; el resumen y los catálogos usan caché en memoria de 60 segundos.

`setup_db.js`, `etl.js` y `data/` se conservan como estaban. No se ejecutan migraciones ni operaciones destructivas durante el arranque.
