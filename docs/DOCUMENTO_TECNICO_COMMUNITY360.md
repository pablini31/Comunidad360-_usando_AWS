# DOCUMENTO TÉCNICO — COMMUNITY 360
## Arquitectura de Datos Híbrida en la Nube y Dashboard Analítico en Tiempo Real

- **Asignatura:** Bases de Datos en la Nube
- **Unidad temática:** Unidad III. Persistencia en la nube, arquitectura de datos y consumo reactivo
- **Producto:** Sistema web de análisis de datos con persistencia híbrida en AWS (Amazon RDS for MariaDB + Amazon DynamoDB), API REST y WebSockets (`socket.io`)

---

## 1. Contextualización del Problema y Regla de Privacidad

La comunidad **Community 360** reúne a creadores y aficionados a las artes digitales, videojuegos, cómics y eventos culturales con presencia en **Discord, Telegram, TikTok, Instagram, Facebook y Twitter/X**. Originalmente, sus registros operaban dispersos en dos archivos CSV:

1. `comunidad_virtual_usuarios.csv` (**1,068 registros**): padrón demográfico, ubicación geográfica aproximada, intereses, métricas de participación de 30 días y estado (`activo`, `en_riesgo`, `inactivo`).
2. `comunidad_virtual_1000_interacciones.csv` (**1,000 registros**): bitácora de mensajes, comentarios, publicaciones y reacciones asociadas por `id_usuario`.

### Problemáticas detectadas en los archivos fuente
- **Inconsistencias de integridad referencial:** **793 interacciones** hacían referencia a identificadores `id_usuario` inexistentes en el padrón de usuarios.
- **Anomalías semánticas y de formato:** fechas en formato `DD/MM/YYYY`, reacciones sin texto (`texto` vacío) pero con `longitud_texto > 0`, y etiquetas multivaluadas concatenadas con el carácter pipe (`|`).
- **Condición obligatoria de privacidad (`consentimiento_datos = "no"`):** **171 usuarios** expresaron que **no autorizan** el tratamiento de su ubicación geográfica. Por regla normativa y arquitectónica, su país, estado, ciudad, zona horaria, latitud y longitud deben eliminarse antes de persistirse en la nube y nunca exponerse en mapas ni reportes geográficos.

---

## 2. Exploración Tecnológica y Decisión Arquitectónica Híbrida (SQL + NoSQL)

Tras analizar la naturaleza estructural y operativa de ambos conjuntos de datos, se diseñó e implementó una **arquitectura híbrida complementaria en Amazon Web Services (AWS)** utilizando sus modalidades de capa gratuita:

1. **Persistencia Relacional (SQL) — Amazon RDS for MariaDB (`us-east-2`):**
   - Almacena el catálogo geográfico normalizado en **Tercera Forma Normal (3FN)** (`paises`, `estados`, `ciudades`), el padrón maestro de `usuarios`, la tabla de control de acceso `administradores_auth` y la auditoría `bitacora_etl`.
   - **Justificación:** El padrón de usuarios posee estructura fija, requiere integridad referencial estricta (`FOREIGN KEY`), restricciones de dominio (`CHECK`), unicidad de `alias`, transacciones ACID, triggers de privacidad (`BEFORE INSERT` / `BEFORE UPDATE`) y agregaciones relacionales (`JOIN`, `GROUP BY`).

2. **Persistencia Documental (NoSQL) — Amazon DynamoDB (`us-east-2`, Capa Gratuita 5 RCU / 5 WCU):**
   - Almacena las colecciones `community360_interacciones` (**207 documentos válidos**) y `community360_cuarentena` (**793 documentos retenidos para auditoría y reprocesamiento**).
   - **Justificación:** Las interacciones constituyen eventos de alta frecuencia con atributos opcionales (`texto` ausente en reacciones, subdocumento `ubicacion` omitido cuando no hay consentimiento) y arreglos nativos (`etiquetas: ["arte", "comunidad"]`). Además, los Índices Secundarios Globales (`gsi_canal_fecha`, `gsi_usuario_fecha` y `gsi_motivo_fecha`) permiten consultas históricas por canal, usuario o motivo en milisegundos.

---

## 3. Fase 1 — Análisis y Modelado de Datos

### 3.1 Comparativa Técnica SQL vs. NoSQL aplicada a Community 360

| Criterio Técnico | Paradigma Relacional (Amazon RDS MariaDB) | Paradigma Documental (Amazon DynamoDB) | Aplicación en Community 360 |
| :--- | :--- | :--- | :--- |
| **Estructura y Esquema** | Esquema rígido y tipado en 3FN; evita redundancia geográfica en países, estados y ciudades. | Esquema flexible orientado a documentos JSON; soporta listas nativas (`etiquetas`) y mapas anidados (`ubicacion`). | **SQL** para catálogo geográfico y usuarios; **NoSQL** para eventos de interacción y cuarentena. |
| **Integridad Referencial** | Nativa mediante `FOREIGN KEY` (`usuarios.ciudad_id -> ciudades.ciudad_id`) y `CHECK` constraints. | No aplica llaves foráneas entre tablas; la integridad se valida en el ETL y en la capa de servicio Express. | El ETL y la API verifican `id_usuario` en MariaDB antes de insertar en DynamoDB o envían a cuarentena. |
| **Consultas Analíticas y Agregaciones** | Excelente soporte de `JOIN`, `GROUP BY`, `COUNT`, `SUM`, `AVG` y filtros multicriterio paginados. | Optimizado para lecturas clave-valor (`GetItem`) y consultas por clave de partición + ordenamiento en GSIs (`Query`). | `/api/analytics/resumen` combina agregaciones SQL en MariaDB con proyección optimizada en DynamoDB. |
| **Frecuencia y Volumen de Escrituras** | Escrituras transaccionales moderadas (altas/cambios de perfil y bitácora). | Diseñado para ingestión continua de eventos en tiempo real con baja latencia. | Las interacciones entrantes por REST/Postman se escriben en DynamoDB y notifican vía WebSockets. |
| **Escalabilidad y Disponibilidad** | Escalabilidad vertical en instancia RDS con respaldos automatizados y conexiones TLS/SSL. | Escalabilidad horizontal administrada con particionamiento automático y replicación multi-AZ. | Arquitectura desacoplada con tolerancia a fallos parciales (`Promise.allSettled`). |
| **Consistencia de Datos** | Consistencia fuerte (ACID) garantizada por `InnoDB` y triggers de privacidad. | Consistencia eventual por defecto en GSIs y lecturas fuertemente consistentes por clave primaria (`id_interaccion`). | Uso de `ConditionExpression: attribute_not_exists(#id)` / `attribute_exists(#id)` para evitar colisiones. |
| **Costos y Límites (Capa Gratuita)** | Instancia `db.t3.micro` (750 h/mes, 20 GB almacenamiento) con pool controlado de 5 conexiones. | 25 GB de almacenamiento + **5 RCU y 5 WCU** aprovisionados sin costo. | Se implementó caché TTL en memoria, `ProjectionExpression`, `Select: 'COUNT'` y backoff exponencial. |

---

### 3.2 Diccionario de Datos — Modelo Relacional (Amazon RDS for MariaDB)

#### Tabla 1: `paises`
| Columna | Tipo | Nulo | Clave / Restricción | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| `pais_id` | `INT` | No | `PK, AUTO_INCREMENT` | Identificador único del país. |
| `nombre` | `VARCHAR(60)` | No | `UNIQUE, CHECK(LEN > 0)` | Nombre normalizado del país (7 países registrados). |

#### Tabla 2: `estados`
| Columna | Tipo | Nulo | Clave / Restricción | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| `estado_id` | `INT` | No | `PK, AUTO_INCREMENT` | Identificador único del estado o región. |
| `pais_id` | `INT` | No | `FK -> paises(pais_id)` | País al que pertenece el estado (`UQ(pais_id, nombre)`). |
| `nombre` | `VARCHAR(60)` | No | `CHECK(LEN > 0)` | Nombre del estado o entidad federativa. |

#### Tabla 3: `ciudades`
| Columna | Tipo | Nulo | Clave / Restricción | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| `ciudad_id` | `INT` | No | `PK, AUTO_INCREMENT` | Identificador único de la ciudad. |
| `estado_id` | `INT` | No | `FK -> estados(estado_id)` | Estado al que pertenece la ciudad (`UQ(estado_id, nombre)`). |
| `nombre` | `VARCHAR(60)` | No | `CHECK(LEN > 0)` | Nombre de la ciudad. |
| `zona_horaria` | `VARCHAR(50)` | No | `CHECK(LIKE '%/%')` | Zona horaria IANA (ej. `America/Mexico_City`). |

#### Tabla 4: `usuarios` (1,068 registros)
| Columna | Tipo | Nulo | Clave / Restricción | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| `id_usuario` | `CHAR(7)` | No | `PK, REGEXP '^U[0-9]{6}$'` | Identificador único del miembro (ej. `U000001`). |
| `alias` | `VARCHAR(50)` | No | `UNIQUE, CHECK(LEN >= 3)` | Nombre público único en la comunidad. |
| `fecha_ingreso` | `DATE` | No | `NOT NULL` | Fecha de alta en formato ISO (`YYYY-MM-DD`). |
| `ciudad_id` | `INT` | Sí | `FK -> ciudades(ciudad_id)` | Ciudad autorizada (`NULL` obligatorio si `consentimiento_datos='no'`). |
| `latitud` | `DECIMAL(9,6)` | Sí | `CHECK(-90..90)` | Latitud (`NULL` obligatorio si `consentimiento_datos='no'`). |
| `longitud` | `DECIMAL(9,6)` | Sí | `CHECK(-180..180)` | Longitud (`NULL` obligatorio si `consentimiento_datos='no'`). |
| `rango_edad` | `VARCHAR(10)` | No | `IN ('18-24','25-31','32-38','39+')` | Segmento demográfico de edad. |
| `especie_fursona` | `VARCHAR(40)` | No | `NOT NULL` | Afinidad o personaje del miembro (ej. `Lobo`, `Zorro`, `Gato`). |
| `interes_principal` | `VARCHAR(50)` | No | `NOT NULL` | Temática principal (ej. `Arte digital`, `Videojuegos`, `Cosplay`). |
| `plataforma_principal` | `VARCHAR(30)` | No | `IN ('Discord','Facebook','Instagram','Telegram','TikTok','Twitter/X')` | Red o canal principal del miembro. |
| `es_artista` | `TINYINT(1)` | No | `IN (0, 1), DEFAULT 0` | Indica si el miembro es creador/artista (`1`) o no (`0`). |
| `mensajes_30d` | `INT` | No | `>= 0` | Mensajes enviados en los últimos 30 días (`0` si `estatus='inactivo'`). |
| `reacciones_30d` | `INT` | No | `>= 0` | Reacciones realizadas en los últimos 30 días (`0` si `estatus='inactivo'`). |
| `eventos_asistidos` | `INT` | No | `>= 0` | Total de eventos comunitarios asistidos. |
| `comisiones_compradas` | `INT` | No | `>= 0` | Total de comisiones artísticas adquiridas. |
| `sentimiento_promedio` | `DECIMAL(5,3)` | No | `BETWEEN -1.000 AND 1.000` | Índice de ánimo histórico del miembro. |
| `ultima_actividad` | `DATE` | No | `>= fecha_ingreso` | Fecha de última participación registrada. |
| `estatus` | `VARCHAR(15)` | No | `IN ('activo','en_riesgo','inactivo')` | Estado de retención del miembro. |
| `consentimiento_datos` | `VARCHAR(2)` | No | `IN ('si','no')` | Autorización de tratamiento de ubicación geográfica. |

#### Tabla 5: `administradores_auth` y Tabla 6: `bitacora_etl`
- `administradores_auth`: `admin_id (PK)`, `username (UNIQUE)`, `email (UNIQUE)`, `password_hash (CHAR 60 bcrypt $2*)`, `rol ('admin'|'analista')`, `activo (0|1)`, `creado_en (TIMESTAMP)`.
- `bitacora_etl`: `ejecucion_id (PK)`, `fecha_ejecucion`, `entidad_procesada ('usuarios'|'interacciones')`, `registros_recibidos`, `registros_aceptados`, `registros_transformados`, `registros_anonimizados`, `registros_rechazados`, `observaciones`.

---

### 3.3 Diccionario de Datos — Modelo Documental (Amazon DynamoDB)

#### Colección 1: `community360_interacciones` (207 documentos válidos)
- **Clave de partición (PK):** `id_interaccion` (`String`)
- **GSI 1 (`gsi_usuario_fecha`):** PK = `id_usuario` (`String`), SK = `timestamp` (`String` ISO-8601)
- **GSI 2 (`gsi_canal_fecha`):** PK = `canal` (`String`), SK = `timestamp` (`String` ISO-8601)
- **Atributos del documento:**
  - `id_interaccion` (`String`): identificador único de la interacción (ej. `I000002`).
  - `id_usuario` (`String`): referencia verificada a `usuarios.id_usuario` en MariaDB.
  - `timestamp` (`String`): marca temporal UTC en formato ISO-8601.
  - `canal` (`String`): plataforma donde ocurrió la actividad (`Discord`, `Telegram`, `Instagram`, etc.).
  - `tipo` (`String`): formato normalizado en minúsculas (`publicacion`, `comentario`, `mensaje`, `reaccion`).
  - `texto` (`String`, *opcional*): contenido textual (omitido automáticamente cuando `tipo = "reaccion"`).
  - `tema` (`String`): categoría temática de la conversación.
  - `sentimiento` (`Number`): puntuación de sentimiento en el rango $[-1, 1]$.
  - `idioma` (`String`): código de idioma (`es`, `en`, `pt`).
  - `dispositivo` (`String`): origen de conexión (`web`, `mobile`, `desktop`, `Android`, `iOS`).
  - `longitud_texto` (`Number`): longitud del texto (`0` forzado para reacciones sin texto).
  - `reacciones_recibidas` (`Number`): entero $\ge 0$ con las reacciones acumuladas.
  - `etiquetas` (`List<String>`): arreglo nativo de etiquetas en minúsculas sin duplicados.
  - `ubicacion_autorizada` (`Boolean`): `true` únicamente si el usuario tiene `consentimiento_datos = "si"`.
  - `ubicacion` (`Map`, *opcional*): `{ pais, estado, ciudad }`, presente **solo** cuando `ubicacion_autorizada = true`.

#### Colección 2: `community360_cuarentena` (793 documentos retenidos)
- **Clave de partición (PK):** `id_interaccion` (`String`)
- **GSI 1 (`gsi_motivo_fecha`):** PK = `motivo_rechazo` (`String`), SK = `fecha_cuarentena` (`String` ISO-8601)
- **Atributos:** `id_interaccion`, `id_usuario_referenciado`, `motivo_rechazo` (`USUARIO_NO_EXISTE_EN_PADRON` | `USUARIO_ELIMINADO_POR_ADMIN`), `regla_violada`, `fecha_cuarentena`, `archivo_origen` y `registro_original` (`Map`).

---

### 3.4 Diagrama Entidad-Relación y Modelo Documental Híbrido

```mermaid
erDiagram
    PAISES ||--o{ ESTADOS : "contiene"
    ESTADOS ||--o{ CIUDADES : "contiene"
    CIUDADES |o--o{ USUARIOS : "ubica (solo consentimiento=si)"
    USUARIOS ||..o{ DYNAMO_INTERACCIONES : "id_usuario (integridad hibrida)"
    DYNAMO_CUARENTENA }o..o| USUARIOS : "reprocesa hacia id_usuario"

    PAISES {
        int pais_id PK
        varchar nombre UK
    }
    ESTADOS {
        int estado_id PK
        int pais_id FK
        varchar nombre
    }
    CIUDADES {
        int ciudad_id PK
        int estado_id FK
        varchar nombre
        varchar zona_horaria
    }
    USUARIOS {
        char id_usuario PK
        varchar alias UK
        date fecha_ingreso
        int ciudad_id FK
        decimal latitud
        decimal longitud
        varchar rango_edad
        varchar especie_fursona
        varchar interes_principal
        varchar plataforma_principal
        tinyint es_artista
        int mensajes_30d
        int reacciones_30d
        decimal sentimiento_promedio
        date ultima_actividad
        varchar estatus
        varchar consentimiento_datos
    }
    DYNAMO_INTERACCIONES {
        string id_interaccion PK
        string id_usuario GSI_PK
        string canal GSI_PK
        string timestamp GSI_SK
        string tipo
        string texto
        string tema
        number sentimiento
        number longitud_texto
        number reacciones_recibidas
        list etiquetas
        boolean ubicacion_autorizada
        map ubicacion
    }
    DYNAMO_CUARENTENA {
        string id_interaccion PK
        string motivo_rechazo GSI_PK
        string fecha_cuarentena GSI_SK
        string id_usuario_referenciado
        string regla_violada
        map registro_original
    }
```

---

## 4. Fase 2 — Limpieza, Transformación y Carga (Proceso ETL)

El script `etl.js` implementa un flujo reproducible en 8 etapas que genera los archivos depurados en `data/clean/` y carga ambas bases de datos en AWS respetando el límite gratuito de 5 WCU mediante escritura por lotes con pausa controlada.

### 4.1 Resumen de Calidad de Datos (Antes vs. Después del ETL)

| Entidad / Colección | Registros Leídos (Raw) | Duplicados / Inválidos | Anonimizados por Privacidad (`consentimiento='no'`) | Transformados (Fechas, Etiquetas `\|`, Reacciones `longitud=0`) | Registros Válidos Cargados | Enviados a Cuarentena |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Usuarios (`MariaDB`)** | 1,068 | 0 | **171** | **1,068** | **1,068** | 0 |
| **Interacciones (`DynamoDB`)** | 1,000 | 0 | **31** | **207** | **207** | **793** |

- **Normalización 3FN generada automáticamente en MariaDB:** 7 países, 27 estados y 31 ciudades.
- **Integridad referencial preservada sin pérdida de datos:** Las **793 interacciones** cuyo `id_usuario` no existía en el padrón fueron documentadas en `community360_cuarentena` con `motivo_rechazo = "USUARIO_NO_EXISTE_EN_PADRON"` y `regla_violada = "INTEGRIDAD_REFERENCIAL_ID_USUARIO"`.

### 4.2 Ejemplo Real de Registro Antes y Después de Anonimización (`U000004`)

**Antes del ETL (`data/raw/comunidad_virtual_usuarios.csv`):**
```json
{
  "id_usuario": "U000004",
  "alias": "AshCh'a30",
  "fecha_ingreso": "06/04/2026",
  "pais": "México",
  "estado": "Nuevo León",
  "ciudad": "Monterrey",
  "latitud": "",
  "longitud": "",
  "zona_horaria": "America/Monterrey",
  "rango_edad": "25-31",
  "especie_fursona": "Gato",
  "interes_principal": "Arte digital",
  "plataforma_principal": "Twitter/X",
  "es_artista": "0",
  "mensajes_30d": "19",
  "reacciones_30d": "75",
  "sentimiento_promedio": "-0.022",
  "ultima_actividad": "28/10/2026",
  "estatus": "activo",
  "consentimiento_datos": "no"
}
```

**Después del ETL (`data/clean/usuarios_depurados.csv` y persistido en MariaDB):**
```json
{
  "id_usuario": "U000004",
  "alias": "AshCh'a30",
  "fecha_ingreso": "2026-04-06",
  "ciudad_id": null,
  "pais": null,
  "estado": null,
  "ciudad": null,
  "zona_horaria": null,
  "latitud": null,
  "longitud": null,
  "rango_edad": "25-31",
  "especie_fursona": "Gato",
  "interes_principal": "Arte digital",
  "plataforma_principal": "Twitter/X",
  "es_artista": 0,
  "mensajes_30d": 19,
  "reacciones_30d": 75,
  "sentimiento_promedio": -0.022,
  "ultima_actividad": "2026-10-28",
  "estatus": "activo",
  "consentimiento_datos": "no"
}
```

---

## 5. Fase 3 — Sistema de Autenticación y Seguridad

1. **Validación contra base de datos en la nube:** `POST /api/auth/login` consulta `administradores_auth` en Amazon RDS MariaDB.
2. **Hashing criptográfico seguro:** Contraseñas almacenadas con `bcryptjs` (factor de costo 10, hash de 60 caracteres `$2b$10$...`), jamás en texto plano. Mitigación de ataques de temporización con `dummyHash`.
3. **Tokens JWT y Control de Acceso Basado en Roles (RBAC):**
   - Emisión de JWT firmado con `JWT_SECRET` (mínimo 32 bytes) y expiración configurable (`JWT_EXPIRES_IN=8h`).
   - Middleware `auth.middleware.js` en todas las rutas `/api/*` y en el handshake de `socket.io`.
   - Middleware `rbac.middleware.js`: restringe escrituras (`POST`, `PUT`, `PATCH`, `DELETE`) y gestión de cuentas exclusivamente al rol `admin`, brindando al rol `analista` acceso de exploración y lectura (`403 Forbidden` ante intentos de escritura).
4. **Protección de secretos y cabeceras HTTP:** Variables de entorno en `.env` (excluidas en `.gitignore`), limitador de intentos `express-rate-limit` en login, y cabeceras `helmet` con `Content-Security-Policy` y `Referrer-Policy`.

---

## 6. Fase 4 — Implementación de API REST

| Método | Ruta | Rol | Códigos HTTP | Descripción y Reglas de Validación (Zod) |
| :---: | :--- | :---: | :---: | :--- |
| `POST` | `/api/auth/login` | Público | `200, 400, 401, 429` | Autentica credenciales contra MariaDB y devuelve `{ token, user }`. |
| `GET` | `/api/auth/me` | Ambos | `200, 401` | Devuelve la sesión vigente del usuario autenticado. |
| `GET` | `/api/interacciones` | Ambos | `200, 400, 401` | Consulta histórica paginada por cursor (`gsi_usuario_fecha` / `gsi_canal_fecha`) con filtro de privacidad. |
| `GET` | `/api/interacciones/:id` | Ambos | `200, 404` | Obtiene una interacción por su clave primaria ocultando ubicación si no hay consentimiento. |
| `POST` | `/api/interacciones` | `admin` | `201, 202, 400, 403, 409, 422` | Crea una interacción en DynamoDB validando que `id_usuario` exista en MariaDB, aplicando privacidad y forzando `longitud_texto=0` si `tipo='reaccion'`. |
| `PUT` | `/api/interacciones/:id` | `admin` | `200, 400, 403, 404, 422` | Actualiza una interacción existente en DynamoDB verificando privacidad y reglas de negocio. |
| `PATCH` | `/api/interacciones/:id` | `admin` | `200, 400, 403, 404, 422` | Modificación parcial validada sobre una interacción existente en DynamoDB. |
| `DELETE` | `/api/interacciones/:id` | `admin` | `200, 403, 404` | Elimina de forma controlada una interacción existente (`ConditionExpression: attribute_exists`). |
| `GET` | `/api/cuarentena` | Ambos | `200, 400` | Lista paginada de registros en cuarentena (`gsi_motivo_fecha`). |
| `POST` | `/api/cuarentena/:id/reprocesar` | `admin` | `200, 404, 409, 422` | Vincula un registro de cuarentena a un `id_usuario` válido y lo mueve a `community360_interacciones`. |
| `GET` | `/api/analytics/resumen` | Ambos | `200` | Calcula KPIs e indicadores híbridos (MariaDB + DynamoDB) con caché TTL de 120 s. |
| `GET` | `/api/analytics/mapa` | Ambos | `200` | Devuelve exclusivamente coordenadas y sentimiento de usuarios con `consentimiento_datos='si'` (**793 puntos**). |
| `GET` | `/api/usuarios` y `/export/csv` | Ambos | `200` | Directorio paginado/filtrado y exportación CSV con protección contra *Formula Injection*. |
| `POST, PUT, DELETE` | `/api/usuarios[/:id]` | `admin` | `200, 201, 204, 400, 409` | CRUD de miembros en MariaDB con anonimización automática en cascada hacia DynamoDB. |

---

## 7. Fase 5 — Implementación de WebSockets (`socket.io`)

- **Servidor (`src/services/realtime.service.js` y `src/server.js`):**
  - El servidor HTTP monta `socket.io` y exige un token JWT válido en `socket.handshake.auth.token`.
  - Cuando se ejecuta desde **Postman** un `POST`, `PUT`, `PATCH` o `DELETE` sobre `/api/interacciones` (o un reproceso desde cuarentena), el backend:
    1. Invalida de inmediato la caché de analítica (`cache.clear()`).
    2. Emite el evento puntual (`interaccion:creada`, `interaccion:actualizada` o `interaccion:eliminada`).
    3. Recalcula todos los indicadores reales desde MariaDB y DynamoDB (`getAnalyticsSummary({ forceRefresh: true })`) y emite `analytics:actualizado`.
- **Cliente (`public/modules/realtime.js`, `adminView.js`, `analystView.js`):**
  - Escucha los eventos y actualiza **sin recargar la página**: tarjetas KPI, barra de pulso, gráfica de barras de canales, gráfica de dona de tipos de actividad, mapa de calor (`leaflet.heat`) y flujo de conversaciones.
  - **Cumplimiento de restricción:** El dashboard **no incluye ningún botón ni formulario** para crear, modificar o eliminar interacciones; dichas operaciones se realizan exclusivamente desde Postman con la colección `postman/Community360_Demo.postman_collection.json`.

---

## 8. Fase 6 — Indicadores Dinámicos y Fórmulas Matemáticas

Sea $I = \{i_1, \dots, i_N\}$ el conjunto de interacciones válidas en DynamoDB ($N = |I|$) y $U = \{u_1, \dots, u_M\}$ el conjunto de miembros en MariaDB ($M = |U|$):

1. **Total de actividad comunitaria ($N$):**
   $$N = |I|$$
2. **Sentimiento promedio de la actividad ($\bar{s}_{\text{act}}$):**
   $$\bar{s}_{\text{act}} = \frac{1}{N_s} \sum_{i=1}^{N_s} s_i, \quad s_i \in [-1, 1]$$
3. **Tasa de positividad de la actividad ($P_{+}$):**
   $$P_{+} = \frac{|\{i \in I \mid s_i \ge 0.05\}|}{N_s} \times 100$$
4. **Promedio de reacciones por publicación ($\bar{r}$):**
   $$\bar{r} = \frac{1}{N} \sum_{i=1}^{N} r_i$$
5. **Tasa de participación por canal ($T_c$ — Gráfica de Barras en Vivo):**
   $$n_c = |\{i \in I \mid \text{canal}(i) = c\}|, \qquad T_c = \frac{n_c}{N} \times 100$$
6. **Distribución por formato de actividad ($T_t$ — Gráfica de Dona en Vivo):**
   $$n_t = |\{i \in I \mid \text{tipo}(i) = t\}|, \qquad T_t = \frac{n_t}{N} \times 100$$
7. **Intensidad dinámica en el Mapa de Calor (`leaflet.heat`):**
   Para cada miembro autorizado $k$ con sentimiento $s_k$ ubicado en una ciudad con $a_{\text{ciudad}(k)}$ interacciones activas:
   $$w_k = \min\!\left(1.0,\ \max\!\left(0.28,\ \frac{s_k + 1}{2} + \min\big(0.28,\ 0.08 \cdot \ln(1 + a_{\text{ciudad}(k)})\big)\right)\right)$$
   *(Los $N_{\text{protegidos}} = 171$ miembros con `consentimiento_datos = "no"` quedan 100% excluidos del mapa).*
