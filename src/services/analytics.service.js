const pool = require('../config/mariadb');
const ddb = require('./dynamo.service');
const cache = require('./cache.service');
const { interactionsTable, quarantineTable } = require('../config/dynamodb');

function logDynamoDegraded(context, err) {
  const firstLine = String(err?.message || '').split('\n')[0];
  const meta = err?.$metadata?.httpStatusCode ? ` [AWS HTTP ${err.$metadata.httpStatusCode}]` : '';
  console.error(`[DynamoDB] Fallo en ${context} (${err?.name || err?.code || 'Error'})${meta}: ${firstLine}`);
}

async function computeAnalyticsSummary() {
  const [[totals]] = await pool.execute(
    "SELECT COUNT(*) total_usuarios,SUM(estatus='activo') activos,SUM(estatus='en_riesgo') en_riesgo,SUM(estatus='inactivo') inactivos,SUM(consentimiento_datos='si') consentimiento_si,SUM(consentimiento_datos='no') consentimiento_no,SUM(es_artista=1) artistas,AVG(sentimiento_promedio) sentimiento_promedio FROM usuarios"
  );
  const [platforms] = await pool.execute(
    'SELECT plataforma_principal nombre,COUNT(*) total FROM usuarios GROUP BY plataforma_principal ORDER BY total DESC'
  );
  const [species] = await pool.execute(
    'SELECT especie_fursona nombre,COUNT(*) total FROM usuarios GROUP BY especie_fursona ORDER BY total DESC LIMIT 10'
  );
  const [interests] = await pool.execute(
    'SELECT interes_principal nombre,COUNT(*) total FROM usuarios GROUP BY interes_principal ORDER BY total DESC LIMIT 10'
  );
  const [geoRows] = await pool.execute(
    "SELECT p.nombre pais,c.nombre ciudad,COUNT(DISTINCT u.id_usuario) usuarios,AVG(u.sentimiento_promedio) sentimiento_promedio FROM usuarios u JOIN ciudades c ON c.ciudad_id=u.ciudad_id JOIN estados e ON e.estado_id=c.estado_id JOIN paises p ON p.pais_id=e.pais_id WHERE u.consentimiento_datos='si' GROUP BY p.nombre,c.nombre ORDER BY usuarios DESC"
  );
  const [consentedRows] = await pool.execute("SELECT id_usuario FROM usuarios WHERE consentimiento_datos='si'");

  const consentedUsers = new Set(consentedRows.map((row) => row.id_usuario));
  let interactions = [];
  let quarantineCount = 0;
  let actividadDisponible = true;

  try {
    interactions = await ddb.scanAll(interactionsTable, {
      pageLimit: 100,
      projection: 'id_usuario, #canal, #tipo, tema, sentimiento, reacciones_recibidas, ubicacion_autorizada, ubicacion',
      expressionAttributeNames: { '#canal': 'canal', '#tipo': 'tipo' },
      paceMs: 120,
    });
    quarantineCount = await ddb.countAll(quarantineTable, 80);
  } catch (err) {
    actividadDisponible = false;
    logDynamoDegraded('analytics.service:computeAnalyticsSummary', err);
  }

  const channelMap = {};
  const typeMap = {};
  const topicMap = {};
  const cityMap = new Map();
  const countryMap = new Map();

  let sentimentSum = 0;
  let sentimentCount = 0;
  let positiveCount = 0;
  let reactionsSum = 0;

  for (const i of interactions) {
    if (i.canal) channelMap[i.canal] = (channelMap[i.canal] || 0) + 1;
    if (i.tipo) typeMap[i.tipo] = (typeMap[i.tipo] || 0) + 1;
    if (i.tema) topicMap[i.tema] = (topicMap[i.tema] || 0) + 1;

    const sVal = Number(i.sentimiento);
    if (!Number.isNaN(sVal)) {
      sentimentSum += sVal;
      sentimentCount += 1;
      if (sVal >= 0.05) positiveCount += 1;
    }

    const rVal = Number(i.reacciones_recibidas || 0);
    if (!Number.isNaN(rVal) && rVal > 0) reactionsSum += rVal;

    if (consentedUsers.has(i.id_usuario) && i.ubicacion_autorizada === true && i.ubicacion) {
      const key = `${i.ubicacion.pais}|${i.ubicacion.ciudad}`;
      cityMap.set(key, (cityMap.get(key) || 0) + 1);
      countryMap.set(i.ubicacion.pais, (countryMap.get(i.ubicacion.pais) || 0) + 1);
    }
  }

  const totalAct = interactions.length;
  const canales = Object.entries(channelMap)
    .map(([canal, total]) => ({
      canal,
      total,
      tasa_participacion: totalAct ? Number(((total / totalAct) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const porTipo = Object.entries(typeMap)
    .map(([tipo, total]) => ({
      tipo,
      total,
      tasa_participacion: totalAct ? Number(((total / totalAct) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const topTemas = Object.entries(topicMap)
    .map(([tema, total]) => ({ tema, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const porCiudad = geoRows.map((x) => ({
    ...x,
    interacciones: cityMap.get(`${x.pais}|${x.ciudad}`) || 0,
  }));

  const porPais = new Map();
  for (const x of geoRows) {
    if (!porPais.has(x.pais)) {
      porPais.set(x.pais, {
        pais: x.pais,
        usuarios: 0,
        sentimiento_ponderado: 0,
        interacciones: countryMap.get(x.pais) || 0,
      });
    }
    const p = porPais.get(x.pais);
    p.usuarios += Number(x.usuarios);
    p.sentimiento_ponderado += Number(x.sentimiento_promedio || 0) * Number(x.usuarios);
  }
  const paises = [...porPais.values()]
    .map((x) => ({
      pais: x.pais,
      usuarios: x.usuarios,
      sentimiento_promedio: x.usuarios ? x.sentimiento_ponderado / x.usuarios : 0,
      interacciones: x.interacciones,
    }))
    .sort((a, b) => b.usuarios - a.usuarios);

  const sentimientoInteraccionesPromedio =
    actividadDisponible && sentimentCount ? Number((sentimentSum / sentimentCount).toFixed(4)) : null;
  const promedioReacciones = actividadDisponible && totalAct ? Number((reactionsSum / totalAct).toFixed(2)) : null;
  const tasaPositividadActividad =
    actividadDisponible && sentimentCount ? Number(((positiveCount / sentimentCount) * 100).toFixed(2)) : null;

  return {
    ...totals,
    total_interacciones_validas: actividadDisponible ? totalAct : null,
    total_en_cuarentena: actividadDisponible ? quarantineCount : null,
    sentimiento_interacciones_promedio: sentimientoInteraccionesPromedio,
    total_reacciones: actividadDisponible ? reactionsSum : null,
    promedio_reacciones: promedioReacciones,
    tasa_positividad_actividad: tasaPositividadActividad,
    actividad_disponible: actividadDisponible,
    actualizado_en: new Date().toISOString(),
    canales,
    por_tipo: porTipo,
    top_temas: topTemas,
    plataformas: platforms,
    top_especies: species,
    top_intereses: interests,
    por_pais: paises,
    por_ciudad: porCiudad,
  };
}

async function getAnalyticsSummary({ forceRefresh = false } = {}) {
  if (forceRefresh) {
    cache.del('analytics:resumen');
  }
  return cache.getOrLoad(
    'analytics:resumen',
    120000,
    computeAnalyticsSummary,
    (result) => Boolean(result?.actividad_disponible)
  );
}

module.exports = { getAnalyticsSummary, computeAnalyticsSummary, logDynamoDegraded };
