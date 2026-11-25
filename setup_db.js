require('dotenv').config();
const mysql = require('mysql2/promise');

async function crearEsquema() {
    let conn;
    try {
        console.log('Conectando a Amazon RDS for MariaDB...');
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: { rejectUnauthorized: false },
        });
        console.log('Conexión exitosa a:', process.env.DB_NAME);

        // 1. Tabla paises
        await conn.query(`
      CREATE TABLE IF NOT EXISTS paises (
        pais_id INT PRIMARY KEY AUTO_INCREMENT,
        nombre VARCHAR(60) NOT NULL UNIQUE,
        CONSTRAINT chk_pais_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // 2. Tabla estados
        await conn.query(`
      CREATE TABLE IF NOT EXISTS estados (
        estado_id INT PRIMARY KEY AUTO_INCREMENT,
        pais_id INT NOT NULL,
        nombre VARCHAR(60) NOT NULL,
        CONSTRAINT uq_estado_pais UNIQUE (pais_id, nombre),
        CONSTRAINT chk_estado_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
        CONSTRAINT fk_estados_pais FOREIGN KEY (pais_id)
          REFERENCES paises(pais_id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // 3. Tabla ciudades
        await conn.query(`
      CREATE TABLE IF NOT EXISTS ciudades (
        ciudad_id INT PRIMARY KEY AUTO_INCREMENT,
        estado_id INT NOT NULL,
        nombre VARCHAR(60) NOT NULL,
        zona_horaria VARCHAR(50) NOT NULL,
        CONSTRAINT uq_ciudad_estado UNIQUE (estado_id, nombre),
        CONSTRAINT chk_ciudad_datos CHECK (
          CHAR_LENGTH(TRIM(nombre)) > 0 AND zona_horaria LIKE '%/%'
        ),
        CONSTRAINT fk_ciudades_estado FOREIGN KEY (estado_id)
          REFERENCES estados(estado_id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // 4. Tabla usuarios (con candados de privacidad, formato y dominio)
        await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario CHAR(7) PRIMARY KEY,
        alias VARCHAR(50) NOT NULL UNIQUE,
        fecha_ingreso DATE NOT NULL,
        ciudad_id INT NULL,
        latitud DECIMAL(9,6) NULL,
        longitud DECIMAL(9,6) NULL,
        rango_edad VARCHAR(10) NOT NULL,
        especie_fursona VARCHAR(40) NOT NULL,
        interes_principal VARCHAR(50) NOT NULL,
        plataforma_principal VARCHAR(30) NOT NULL,
        es_artista TINYINT(1) NOT NULL DEFAULT 0,
        mensajes_30d INT NOT NULL DEFAULT 0,
        reacciones_30d INT NOT NULL DEFAULT 0,
        eventos_asistidos INT NOT NULL DEFAULT 0,
        comisiones_compradas INT NOT NULL DEFAULT 0,
        sentimiento_promedio DECIMAL(5,3) NOT NULL,
        ultima_actividad DATE NOT NULL,
        estatus VARCHAR(15) NOT NULL,
        consentimiento_datos VARCHAR(2) NOT NULL,
        CONSTRAINT fk_usuarios_ciudad FOREIGN KEY (ciudad_id)
          REFERENCES ciudades(ciudad_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_usuario_id CHECK (id_usuario REGEXP '^U[0-9]{6}$'),
        CONSTRAINT chk_usuario_alias CHECK (CHAR_LENGTH(TRIM(alias)) >= 3),
        CONSTRAINT chk_usuario_lat CHECK (latitud IS NULL OR (latitud BETWEEN -90 AND 90)),
        CONSTRAINT chk_usuario_lon CHECK (longitud IS NULL OR (longitud BETWEEN -180 AND 180)),
        CONSTRAINT chk_usuario_coords_par CHECK (
          (latitud IS NULL AND longitud IS NULL) OR
          (latitud IS NOT NULL AND longitud IS NOT NULL)
        ),
        CONSTRAINT chk_usuario_edad CHECK (rango_edad IN ('18-24', '25-31', '32-38', '39+')),
        CONSTRAINT chk_usuario_plat CHECK (
          plataforma_principal IN ('Discord', 'Facebook', 'Instagram', 'Telegram', 'TikTok', 'Twitter/X')
        ),
        CONSTRAINT chk_usuario_artista CHECK (es_artista IN (0, 1)),
        CONSTRAINT chk_usuario_metricas CHECK (
          mensajes_30d >= 0 AND reacciones_30d >= 0 AND
          eventos_asistidos >= 0 AND comisiones_compradas >= 0
        ),
        CONSTRAINT chk_usuario_sent CHECK (sentimiento_promedio BETWEEN -1.000 AND 1.000),
        CONSTRAINT chk_usuario_fechas CHECK (ultima_actividad >= fecha_ingreso),
        CONSTRAINT chk_usuario_estatus CHECK (estatus IN ('activo', 'en_riesgo', 'inactivo')),
        CONSTRAINT chk_usuario_inactivo CHECK (
          estatus <> 'inactivo' OR (mensajes_30d = 0 AND reacciones_30d = 0)
        ),
        CONSTRAINT chk_usuario_consent CHECK (consentimiento_datos IN ('si', 'no')),
        CONSTRAINT chk_usuario_privacidad CHECK (
          consentimiento_datos = 'si' OR
          (latitud IS NULL AND longitud IS NULL)
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Triggers de privacidad (BEFORE INSERT y BEFORE UPDATE)
        await conn.query(`DROP TRIGGER IF EXISTS trg_usuarios_privacidad_bi`);
        await conn.query(`
      CREATE TRIGGER trg_usuarios_privacidad_bi
      BEFORE INSERT ON usuarios
      FOR EACH ROW
      BEGIN
        IF NEW.consentimiento_datos = 'no' THEN
          SET NEW.ciudad_id = NULL;
          SET NEW.latitud = NULL;
          SET NEW.longitud = NULL;
        END IF;
      END
    `);

        await conn.query(`DROP TRIGGER IF EXISTS trg_usuarios_privacidad_bu`);
        await conn.query(`
      CREATE TRIGGER trg_usuarios_privacidad_bu
      BEFORE UPDATE ON usuarios
      FOR EACH ROW
      BEGIN
        IF NEW.consentimiento_datos = 'no' THEN
          SET NEW.ciudad_id = NULL;
          SET NEW.latitud = NULL;
          SET NEW.longitud = NULL;
        END IF;
      END
    `);

        // 5. Tabla administradores_auth (Fase 3)
        await conn.query(`
      CREATE TABLE IF NOT EXISTS administradores_auth (
        admin_id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(40) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL DEFAULT 'admin',
        activo TINYINT(1) NOT NULL DEFAULT 1,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_admin_user CHECK (CHAR_LENGTH(TRIM(username)) >= 4),
        CONSTRAINT chk_admin_email CHECK (email LIKE '%_@_%.__%' AND email NOT LIKE '% %'),
        CONSTRAINT chk_admin_hash CHECK (CHAR_LENGTH(password_hash) = 60 AND password_hash LIKE '$2%'),
        CONSTRAINT chk_admin_rol CHECK (rol IN ('admin', 'analista')),
        CONSTRAINT chk_admin_activo CHECK (activo IN (0, 1))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // 6. Tabla bitacora_etl (auditoría Fase 2)
        await conn.query(`
      CREATE TABLE IF NOT EXISTS bitacora_etl (
        ejecucion_id INT PRIMARY KEY AUTO_INCREMENT,
        fecha_ejecucion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        entidad_procesada VARCHAR(30) NOT NULL,
        registros_recibidos INT NOT NULL,
        registros_aceptados INT NOT NULL,
        registros_transformados INT NOT NULL,
        registros_anonimizados INT NOT NULL DEFAULT 0,
        registros_rechazados INT NOT NULL DEFAULT 0,
        observaciones TEXT NULL,
        CONSTRAINT chk_bit_entidad CHECK (entidad_procesada IN ('usuarios', 'interacciones')),
        CONSTRAINT chk_bit_no_neg CHECK (
          registros_recibidos >= 0 AND registros_aceptados >= 0 AND
          registros_transformados >= 0 AND registros_anonimizados >= 0 AND
          registros_rechazados >= 0
        ),
        CONSTRAINT chk_bit_cuadre CHECK (
          registros_aceptados + registros_rechazados <= registros_recibidos
        ),
        CONSTRAINT chk_bit_anon CHECK (registros_anonimizados <= registros_aceptados)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        const [tablas] = await conn.query('SHOW TABLES');
        console.log('\nTablas creadas en community360_db:');
        console.table(tablas);
        console.log('Triggers de privacidad configurados correctamente.');
    } catch (err) {
        console.error('Error al crear el esquema:', err.message);
    } finally {
        if (conn) await conn.end();
    }
}

crearEsquema();