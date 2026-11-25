const {
  GetCommand,
  QueryCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, interactionsTable, quarantineTable } = require('../config/dynamodb');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const THROTTLE_RE = /throttl|ProvisionedThroughputExceeded|RequestLimitExceeded|LimitExceeded/i;
const MISSING_INDEX_RE = /does not have the specified index|specified index/i;

function isThrottled(err) {
  return THROTTLE_RE.test(`${err?.name || ''} ${err?.message || ''}`);
}

function isMissingIndex(err) {
  return err?.name === 'ValidationException' && MISSING_INDEX_RE.test(err?.message || '');
}

async function send(command) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await docClient.send(command);
    } catch (err) {
      if (!isThrottled(err) || attempt >= 5) throw err;
      const delay = Math.min(300 * (2 ** attempt) + Math.floor(Math.random() * 200), 5000);
      await sleep(delay);
    }
  }
}

const encode = (key) => (key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null);

function decode(token) {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    const e = new Error('Cursor inválido.');
    e.status = 400;
    throw e;
  }
}

function page(result, limit) {
  return {
    items: Array.isArray(result?.Items) ? result.Items : [],
    nextCursor: encode(result?.LastEvaluatedKey),
    limit,
  };
}

function matches(x, f = {}) {
  return (
    (!f.canal || x.canal === f.canal) &&
    (!f.tipo || x.tipo === f.tipo) &&
    (!f.tema || x.tema === f.tema) &&
    (f.ubicacion_autorizada === undefined || x.ubicacion_autorizada === f.ubicacion_autorizada) &&
    (!f.desde || (x.timestamp && x.timestamp >= f.desde)) &&
    (!f.hasta || (x.timestamp && x.timestamp <= f.hasta))
  );
}

async function queryWithFallback({ tableName, indexName, field, value, limit, cursor, scanIndexForward = false }) {
  try {
    return await send(
      new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: '#pk = :v',
        ExpressionAttributeNames: { '#pk': field },
        ExpressionAttributeValues: { ':v': value },
        Limit: limit,
        ScanIndexForward: scanIndexForward,
        ExclusiveStartKey: decode(cursor),
      })
    );
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    console.warn(`[DynamoDB] Índice "${indexName}" no disponible en "${tableName}". Usando consulta alternativa.`);
    return send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#pk = :v',
        ExpressionAttributeNames: { '#pk': field },
        ExpressionAttributeValues: { ':v': value },
        Limit: Math.min(100, Math.max(limit * 3, 50)),
        ExclusiveStartKey: decode(cursor),
      })
    );
  }
}

async function getInteraction(id) {
  const { Item } = await send(
    new GetCommand({
      TableName: interactionsTable,
      Key: { id_interaccion: id },
    })
  );
  return Item || null;
}

async function queryByUser(id, limit = 20, cursor) {
  const r = await queryWithFallback({
    tableName: interactionsTable,
    indexName: 'gsi_usuario_fecha',
    field: 'id_usuario',
    value: id,
    limit,
    cursor,
    scanIndexForward: false,
  });
  return page(r, limit);
}

async function listInteractions({ userId, channel, limit = 20, cursor, filters = {} }) {
  if (userId || channel) {
    const indexName = userId ? 'gsi_usuario_fecha' : 'gsi_canal_fecha';
    const field = userId ? 'id_usuario' : 'canal';
    const value = userId || channel;
    const r = await queryWithFallback({
      tableName: interactionsTable,
      indexName,
      field,
      value,
      limit,
      cursor,
      scanIndexForward: false,
    });
    return page({ ...r, Items: (r.Items || []).filter((x) => matches(x, filters)) }, limit);
  }

  const r = await send(
    new ScanCommand({
      TableName: interactionsTable,
      Limit: limit,
      ExclusiveStartKey: decode(cursor),
    })
  );
  return page({ ...r, Items: (r.Items || []).filter((x) => matches(x, filters)) }, limit);
}

async function listQuarantine({ reason, userId, limit = 20, cursor }) {
  let result;
  if (reason) {
    result = await queryWithFallback({
      tableName: quarantineTable,
      indexName: 'gsi_motivo_fecha',
      field: 'motivo_rechazo',
      value: reason,
      limit,
      cursor,
      scanIndexForward: false,
    });
  } else {
    result = await send(
      new ScanCommand({
        TableName: quarantineTable,
        Limit: limit,
        ExclusiveStartKey: decode(cursor),
      })
    );
  }
  return page(
    { ...result, Items: (result.Items || []).filter((x) => !userId || x.id_usuario_referenciado === userId) },
    limit
  );
}

async function allByUser(id) {
  let cursor;
  const out = [];
  do {
    const r = await queryWithFallback({
      tableName: interactionsTable,
      indexName: 'gsi_usuario_fecha',
      field: 'id_usuario',
      value: id,
      limit: 100,
      cursor: encode(cursor),
      scanIndexForward: false,
    });
    out.push(...(r.Items || []));
    cursor = r.LastEvaluatedKey;
    if (cursor) await sleep(100);
  } while (cursor);
  return out;
}

async function scanAll(tableName, options = {}) {
  const { pageLimit = 100, projection, expressionAttributeNames, paceMs = 120 } =
    typeof options === 'number' ? { pageLimit: options } : options;

  let cursor;
  const out = [];
  do {
    const params = {
      TableName: tableName,
      Limit: pageLimit,
      ExclusiveStartKey: cursor,
    };
    if (projection) params.ProjectionExpression = projection;
    if (expressionAttributeNames) params.ExpressionAttributeNames = expressionAttributeNames;

    const r = await send(new ScanCommand(params));
    out.push(...(r.Items || []));
    cursor = r.LastEvaluatedKey;
    if (cursor && paceMs > 0) await sleep(paceMs);
  } while (cursor);
  return out;
}

async function countAll(tableName, paceMs = 80) {
  let cursor;
  let total = 0;
  do {
    const r = await send(
      new ScanCommand({
        TableName: tableName,
        Select: 'COUNT',
        ExclusiveStartKey: cursor,
      })
    );
    total += Number(r.Count || 0);
    cursor = r.LastEvaluatedKey;
    if (cursor && paceMs > 0) await sleep(paceMs);
  } while (cursor);
  return total;
}

async function redactUserLocation(id) {
  const items = await allByUser(id);
  for (const item of items) {
    await redactInteraction(item.id_interaccion);
  }
}

async function redactInteraction(id) {
  return send(
    new UpdateCommand({
      TableName: interactionsTable,
      Key: { id_interaccion: id },
      UpdateExpression: 'SET #ua = :f REMOVE #ub',
      ExpressionAttributeNames: {
        '#ua': 'ubicacion_autorizada',
        '#ub': 'ubicacion',
      },
      ExpressionAttributeValues: { ':f': false },
    })
  );
}

async function putInteraction(item) {
  return send(
    new PutCommand({
      TableName: interactionsTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id_interaccion' },
    })
  );
}

async function replaceInteraction(item) {
  return send(
    new PutCommand({
      TableName: interactionsTable,
      Item: item,
      ConditionExpression: 'attribute_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id_interaccion' },
    })
  );
}

async function removeInteraction(id) {
  return send(
    new DeleteCommand({
      TableName: interactionsTable,
      Key: { id_interaccion: id },
    })
  );
}

async function deleteInteractionIfExists(id) {
  const result = await send(
    new DeleteCommand({
      TableName: interactionsTable,
      Key: { id_interaccion: id },
      ConditionExpression: 'attribute_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id_interaccion' },
      ReturnValues: 'ALL_OLD',
    })
  );
  return result.Attributes || null;
}

async function quarantineItem(item) {
  return send(
    new PutCommand({
      TableName: quarantineTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id_interaccion' },
    })
  );
}

module.exports = {
  send,
  getInteraction,
  queryByUser,
  listInteractions,
  listQuarantine,
  allByUser,
  scanAll,
  countAll,
  redactUserLocation,
  redactInteraction,
  putInteraction,
  replaceInteraction,
  removeInteraction,
  deleteInteractionIfExists,
  quarantineItem,
};
