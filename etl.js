require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mysql = require('mysql2/promise');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// Rutas de archivos
const RAW_USUARIOS = path.join(__dirname, 'data', 'raw', 'comunidad_virtual_usuarios.csv');
const RAW_INTERACCIONES = path.join(__dirname, 'data', 'raw', 'comunidad_virtual_1000_interacciones.csv');
const CLEAN_DIR = path.join(__dirname, 'data', 'clean');

// Funciones auxiliares de limpieza
const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const limpiarTexto = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

function fechaDMYaISO(fechaStr) {
    const limpio = limpiarTexto(fechaStr);
    if (!limpio) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;
    const m = limpio.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function escaparCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function guardarCSV(ruta, columnas, filas) {
    const lineas = [columnas.join(',')];
    for (const fila of filas) {
        lineas.push(columnas.map((c) => escaparCSV(fila[c])).join(','));
    }
    fs.writeFileSync(ruta, '\uFEFF' + lineas.join('\n'), 'utf8');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Escritura en lotes pequeños a DynamoDB (respeta límite de 5 WCU de capa gratuita)
async function cargarLotesDynamo(docClient, tableName, items) {
    const BATCH_SIZE = 5;
    let cargados = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        let pendientes = items.slice(i, i + BATCH_SIZE).map((Item) => ({ PutRequest: { Item } }));
        let intentos = 0;

        while (pendientes.length > 0 && intentos < 8) {
            try {
                const resp = await docClient.send(
                    new BatchWriteCommand({ RequestItems: { [tableName]: pendientes } })
                );
                const noProcesados = resp.UnprocessedItems?.[tableName] || [];
                cargados += pendientes.length - noProcesados.length;
                pendientes = noProcesados;
                if (pendientes.length > 0) {
                    intentos++;
                    await esperar(1200 * intentos);
                }
            } catch (err) {
                if (err.name === 'ProvisionedThroughputExceededException' || err.name === 'ThrottlingException') {
                    intentos++;
                    await esperar(1500 * intentos);
                } else {
                    throw err;
                }
            }
        }

        if (cargados % 50 === 0 || cargados === items.length) {
            console.log(`   -> ${tableName}: ${cargados}/${items.length} documentos cargados`);
        }
        await esperar(1100);
    }
}

async function ejecutarETL() {
    console.log('=======================================================');
    console.log('   COMMUNITY 360 - PROCESO ETL (FASE 2)');
    console.log('=======================================================\n');

    // Lectura de CSV fuente (parser RFC-4180 que respeta comas entrecomilladas)
    const rawUsuarios = parse(fs.readFileSync(RAW_USUARIOS, 'utf8'), {
        columns: true, skip_empty_lines: true, trim: true, bom: true,
    });
    const rawInteracciones = parse(fs.readFileSync(RAW_INTERACCIONES, 'utf8'), {
        columns: true, skip_empty_lines: true, trim: true, bom: true,
    });

    console.log(`[LECTURA] Usuarios leídos: ${rawUsuarios.length} | Interacciones leídas: ${rawInteracciones.length}`);

    // =========================================================================
    // PROCESAMIENTO DE USUARIOS (Etapas 1, 2, 3, 4 y 6)
    // =========================================================================
    const usuariosMap = new Map();
    const aliasVistos = new Set();
    const usuariosLimpios = [];
    let dupUsuarios = 0;
    let anonUsuarios = 0;
    let rechUsuarios = 0;

    for (const r of rawUsuarios) {
        const id_usuario = limpiarTexto(r.id_usuario);
        const alias = limpiarTexto(r.alias);

        // Etapa 1: Deduplicación
        if (!id_usuario || !alias || usuariosMap.has(id_usuario) || aliasVistos.has(alias.toLowerCase())) {
            dupUsuarios++;
            continue;
        }

        // Etapa 3 y 4: Estandarización de formatos y validación estricta de tipos
        const fecha_ingreso = fechaDMYaISO(r.fecha_ingreso);
        const ultima_actividad = fechaDMYaISO(r.ultima_actividad);
        const consentimiento_datos = quitarAcentos(r.consentimiento_datos) === 'si' ? 'si' : 'no';
        const es_artista = ['1', 'si', 'true', 'yes'].includes(quitarAcentos(r.es_artista)) ? 1 : 0;

        let latitud = limpiarTexto(r.latitud) !== null ? Number(r.latitud) : null;
        let longitud = limpiarTexto(r.longitud) !== null ? Number(r.longitud) : null;
        if (Number.isNaN(latitud) || Number.isNaN(longitud) || latitud === null || longitud === null) {
            latitud = null;
            longitud = null;
        }

        let pais = limpiarTexto(r.pais);
        let estado = limpiarTexto(r.estado);
        let ciudad = limpiarTexto(r.ciudad);
        let zona_horaria = limpiarTexto(r.zona_horaria);

        // Etapa 6: Eliminación estricta de ubicación sin consentimiento
        if (consentimiento_datos === 'no') {
            pais = null;
            estado = null;
            ciudad = null;
            zona_horaria = null;
            latitud = null;
            longitud = null;
            anonUsuarios++;
        }

        const sentimiento_promedio = Number(r.sentimiento_promedio);
        if (!/^U\d{6}$/.test(id_usuario) || !fecha_ingreso || !ultima_actividad || Number.isNaN(sentimiento_promedio)) {
            rechUsuarios++;
            continue;
        }

        const usuario = {
            id_usuario,
            alias,
            fecha_ingreso,
            pais,
            estado,
            ciudad,
            zona_horaria,
            latitud,
            longitud,
            rango_edad: limpiarTexto(r.rango_edad),
            especie_fursona: limpiarTexto(r.especie_fursona),
            interes_principal: limpiarTexto(r.interes_principal),
            plataforma_principal: limpiarTexto(r.plataforma_principal),
            es_artista,
            mensajes_30d: Math.max(0, parseInt(r.mensajes_30d, 10) || 0),
            reacciones_30d: Math.max(0, parseInt(r.reacciones_30d, 10) || 0),
            eventos_asistidos: Math.max(0, parseInt(r.eventos_asistidos, 10) || 0),
            comisiones_compradas: Math.max(0, parseInt(r.comisiones_compradas, 10) || 0),
            sentimiento_promedio: Math.max(-1, Math.min(1, sentimiento_promedio)),
            ultima_actividad,
            estatus: limpiarTexto(r.estatus).toLowerCase(),
            consentimiento_datos,
        };

        usuariosMap.set(id_usuario, usuario);
        aliasVistos.add(alias.toLowerCase());
        usuariosLimpios.push(usuario);
    }

    // =========================================================================
    // PROCESAMIENTO DE INTERACCIONES (Etapas 1 a 6)
    // =========================================================================
    const interVistas = new Set();
    const interaccionesValidas = [];
    const interaccionesCuarentena = [];
    let dupInter = 0;
    let reaccionesCorregidas = 0;
    let interTransformadas = 0;
    let interAnonimizadas = 0;
    const fechaEjecucionISO = new Date().toISOString();

    for (const r of rawInteracciones) {
        const id_interaccion = limpiarTexto(r.id_interaccion);
        const id_usuario = limpiarTexto(r.id_usuario);

        // Etapa 1: Deduplicación
        if (!id_interaccion || interVistas.has(id_interaccion)) {
            dupInter++;
            continue;
        }
        interVistas.add(id_interaccion);

        // Etapa 2: Normalización de nulos y corrección de reacciones sin texto
        const texto = limpiarTexto(r.texto);
        const tipo = limpiarTexto(r.tipo).toLowerCase();
        const longOriginal = parseInt(r.longitud_texto, 10) || 0;
        let longitud_texto = longOriginal;
        let huboTransformacion = false;

        if (texto === null || tipo === 'reaccion') {
            if (longitud_texto !== 0) {
                reaccionesCorregidas++;
                huboTransformacion = true;
            }
            longitud_texto = 0;
        }

        // Etapa 3: Transformación de etiquetas multivaluadas (|) a arreglo nativo
        const etiquetasRaw = limpiarTexto(r.etiquetas);
        const etiquetas = etiquetasRaw
            ? etiquetasRaw.split('|').map((e) => e.trim().toLowerCase()).filter(Boolean)
            : [];
        if (etiquetas.length > 0) huboTransformacion = true;

        // Etapa 5: Validación de integridad referencial contra padrón de usuarios
        const usuarioRef = usuariosMap.get(id_usuario);
        if (!usuarioRef) {
            interaccionesCuarentena.push({
                id_interaccion,
                id_usuario_referenciado: id_usuario || 'DESCONOCIDO',
                motivo_rechazo: 'USUARIO_NO_EXISTE_EN_PADRON',
                regla_violada: 'INTEGRIDAD_REFERENCIAL_ID_USUARIO',
                fecha_cuarentena: fechaEjecucionISO,
                archivo_origen: 'comunidad_virtual_1000_interacciones.csv',
                registro_original: {
                    timestamp: limpiarTexto(r.timestamp),
                    canal: limpiarTexto(r.canal),
                    tipo,
                    texto,
                    tema: limpiarTexto(r.tema),
                    sentimiento: Number(r.sentimiento),
                    idioma: limpiarTexto(r.idioma),
                    dispositivo: limpiarTexto(r.dispositivo),
                    longitud_texto_original: longOriginal,
                    reacciones_recibidas: parseInt(r.reacciones_recibidas, 10) || 0,
                    etiquetas_raw: etiquetasRaw,
                },
            });
            continue;
        }

        if (huboTransformacion) interTransformadas++;

        // Etapa 6: Regla de privacidad en interacciones válidas
        const autorizado = usuarioRef.consentimiento_datos === 'si';
        const doc = {
            id_interaccion,
            id_usuario,
            timestamp: limpiarTexto(r.timestamp),
            canal: limpiarTexto(r.canal),
            tipo,
            tema: limpiarTexto(r.tema),
            sentimiento: Number(r.sentimiento),
            idioma: limpiarTexto(r.idioma) || 'es',
            dispositivo: limpiarTexto(r.dispositivo),
            longitud_texto,
            reacciones_recibidas: Math.max(0, parseInt(r.reacciones_recibidas, 10) || 0),
            etiquetas,
            ubicacion_autorizada: autorizado,
        };

        if (texto !== null) doc.texto = texto;

        if (autorizado) {
            const p = limpiarTexto(r.pais);
            const e = limpiarTexto(r.estado);
            const c = limpiarTexto(r.ciudad);
            if (p && e && c) {
                doc.ubicacion = { pais: p, estado: e, ciudad: c };
            }
        } else {
            interAnonimizadas++;
        }

        interaccionesValidas.push(doc);
    }

    // =========================================================================
    // ETAPA 7: Exportación local de CSV depurados para auditoría
    // =========================================================================
    fs.mkdirSync(CLEAN_DIR, { recursive: true });

    guardarCSV(
        path.join(CLEAN_DIR, 'usuarios_depurados.csv'),
        [
            'id_usuario', 'alias', 'fecha_ingreso', 'pais', 'estado', 'ciudad', 'zona_horaria',
            'latitud', 'longitud', 'rango_edad', 'especie_fursona', 'interes_principal',
            'plataforma_principal', 'es_artista', 'mensajes_30d', 'reacciones_30d',
            'eventos_asistidos', 'comisiones_compradas', 'sentimiento_promedio',
            'ultima_actividad', 'estatus', 'consentimiento_datos',
        ],
        usuariosLimpios
    );

    guardarCSV(
        path.join(CLEAN_DIR, 'interacciones_validas.csv'),
        [
            'id_interaccion', 'id_usuario', 'timestamp', 'canal', 'tipo', 'texto', 'tema',
            'sentimiento', 'idioma', 'dispositivo', 'longitud_texto', 'reacciones_recibidas',
            'etiquetas', 'pais', 'estado', 'ciudad', 'ubicacion_autorizada',
        ],
        interaccionesValidas.map((d) => ({
            ...d,
            texto: d.texto || '',
            etiquetas: JSON.stringify(d.etiquetas),
            pais: d.ubicacion?.pais || '',
            estado: d.ubicacion?.estado || '',
            ciudad: d.ubicacion?.ciudad || '',
        }))
    );

    guardarCSV(
        path.join(CLEAN_DIR, 'interacciones_cuarentena.csv'),
        [
            'id_interaccion', 'id_usuario_referenciado', 'motivo_rechazo',
            'regla_violada', 'fecha_cuarentena', 'canal', 'tipo', 'timestamp',
        ],
        interaccionesCuarentena.map((q) => ({
            id_interaccion: q.id_interaccion,
            id_usuario_referenciado: q.id_usuario_referenciado,
            motivo_rechazo: q.motivo_rechazo,
            regla_violada: q.regla_violada,
            fecha_cuarentena: q.fecha_cuarentena,
            canal: q.registro_original.canal,
            tipo: q.registro_original.tipo,
            timestamp: q.registro_original.timestamp,
        }))
    );

    console.log('[ETAPA 7] Archivos CSV limpios exportados en data/clean/');

    // =========================================================================
    // ETAPA 8A: Carga relacional en Amazon RDS for MariaDB
    // =========================================================================
    console.log('\n[ETAPA 8A] Cargando catálogos y usuarios en MariaDB (RDS)...');
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false },
    });

    try {
        await conn.beginTransaction();

        const paisesCache = new Map();
        const estadosCache = new Map();
        const ciudadesCache = new Map();

        for (const u of usuariosLimpios) {
            let ciudad_id = null;

            if (u.consentimiento_datos === 'si' && u.pais && u.estado && u.ciudad) {
                // 1) País
                if (!paisesCache.has(u.pais)) {
                    await conn.execute('INSERT IGNORE INTO paises (nombre) VALUES (?)', [u.pais]);
                    const [rows] = await conn.execute('SELECT pais_id FROM paises WHERE nombre = ?', [u.pais]);
                    paisesCache.set(u.pais, rows[0].pais_id);
                }
                const pais_id = paisesCache.get(u.pais);

                // 2) Estado
                const keyE = `${pais_id}|${u.estado}`;
                if (!estadosCache.has(keyE)) {
                    await conn.execute('INSERT IGNORE INTO estados (pais_id, nombre) VALUES (?, ?)', [pais_id, u.estado]);
                    const [rows] = await conn.execute(
                        'SELECT estado_id FROM estados WHERE pais_id = ? AND nombre = ?',
                        [pais_id, u.estado]
                    );
                    estadosCache.set(keyE, rows[0].estado_id);
                }
                const estado_id = estadosCache.get(keyE);

                // 3) Ciudad
                const keyC = `${estado_id}|${u.ciudad}`;
                if (!ciudadesCache.has(keyC)) {
                    await conn.execute(
                        'INSERT IGNORE INTO ciudades (estado_id, nombre, zona_horaria) VALUES (?, ?, ?)',
                        [estado_id, u.ciudad, u.zona_horaria]
                    );
                    const [rows] = await conn.execute(
                        'SELECT ciudad_id FROM ciudades WHERE estado_id = ? AND nombre = ?',
                        [estado_id, u.ciudad]
                    );
                    ciudadesCache.set(keyC, rows[0].ciudad_id);
                }
                ciudad_id = ciudadesCache.get(keyC);
            }

            // 4) Usuario (consulta parametrizada segura contra apóstrofos / SQLi)
            await conn.execute(
                `INSERT INTO usuarios (
          id_usuario, alias, fecha_ingreso, ciudad_id, latitud, longitud,
          rango_edad, especie_fursona, interes_principal, plataforma_principal,
          es_artista, mensajes_30d, reacciones_30d, eventos_asistidos,
          comisiones_compradas, sentimiento_promedio, ultima_actividad,
          estatus, consentimiento_datos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          ciudad_id = VALUES(ciudad_id),
          latitud = VALUES(latitud),
          longitud = VALUES(longitud),
          ultima_actividad = VALUES(ultima_actividad),
          estatus = VALUES(estatus),
          consentimiento_datos = VALUES(consentimiento_datos)`,
                [
                    u.id_usuario, u.alias, u.fecha_ingreso, ciudad_id, u.latitud, u.longitud,
                    u.rango_edad, u.especie_fursona, u.interes_principal, u.plataforma_principal,
                    u.es_artista, u.mensajes_30d, u.reacciones_30d, u.eventos_asistidos,
                    u.comisiones_compradas, u.sentimiento_promedio, u.ultima_actividad,
                    u.estatus, u.consentimiento_datos,
                ]
            );
        }

        // Registro de auditoría en bitacora_etl
        await conn.execute(
            `INSERT INTO bitacora_etl (
        entidad_procesada, registros_recibidos, registros_aceptados,
        registros_transformados, registros_anonimizados, registros_rechazados, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                'usuarios', rawUsuarios.length, usuariosLimpios.length,
                usuariosLimpios.length, anonUsuarios, dupUsuarios + rechUsuarios,
                `Catálogos 3FN: ${paisesCache.size} países, ${estadosCache.size} estados, ${ciudadesCache.size} ciudades.`,
            ]
        );

        await conn.execute(
            `INSERT INTO bitacora_etl (
        entidad_procesada, registros_recibidos, registros_aceptados,
        registros_transformados, registros_anonimizados, registros_rechazados, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                'interacciones', rawInteracciones.length, interaccionesValidas.length,
                interTransformadas, interAnonimizadas, interaccionesCuarentena.length + dupInter,
                `Reacciones corregidas (longitud=0): ${reaccionesCorregidas}. Huérfanos enviados a cuarentena: ${interaccionesCuarentena.length}.`,
            ]
        );

        await conn.commit();
        console.log(
            `   -> MariaDB listo: ${paisesCache.size} países, ${estadosCache.size} estados, ${ciudadesCache.size} ciudades, ${usuariosLimpios.length} usuarios y bitácora registrada.`
        );
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        await conn.end();
    }

    // =========================================================================
    // ETAPA 8B: Carga documental en Amazon DynamoDB
    // =========================================================================
    console.log('\n[ETAPA 8B] Cargando colecciones en Amazon DynamoDB (esto tarda ~3 min por límite gratuito)...');
    const ddbClient = new DynamoDBClient({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const docClient = DynamoDBDocumentClient.from(ddbClient, {
        marshallOptions: { removeUndefinedValues: true },
    });

    await cargarLotesDynamo(docClient, 'community360_interacciones', interaccionesValidas);
    await cargarLotesDynamo(docClient, 'community360_cuarentena', interaccionesCuarentena);

    // Resumen final de control (ideal para captura de evidencia Fase 2)
    console.log('\n=======================================================');
    console.log('   RESUMEN FINAL DE EJECUCIÓN ETL - COMMUNITY 360');
    console.log('=======================================================');
    console.table([
        {
            Entidad: 'usuarios (MariaDB)',
            Leidos: rawUsuarios.length,
            Duplicados: dupUsuarios,
            Anonimizados: anonUsuarios,
            Cargados: usuariosLimpios.length,
            Cuarentena: 0,
        },
        {
            Entidad: 'interacciones (DynamoDB)',
            Leidos: rawInteracciones.length,
            Duplicados: dupInter,
            Anonimizados: interAnonimizadas,
            Cargados: interaccionesValidas.length,
            Cuarentena: interaccionesCuarentena.length,
        },
    ]);
    console.log(`Reacciones sin texto corregidas a longitud_texto = 0: ${reaccionesCorregidas}`);
    console.log('Proceso ETL finalizado exitosamente.');
}

ejecutarETL().catch((err) => {
    console.error('\n[ERROR EN ETL]:', err.message);
    process.exit(1);
});