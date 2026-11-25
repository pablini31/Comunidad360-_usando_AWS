require('./env');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const region = (process.env.AWS_REGION || 'us-east-2').trim();
const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
const sessionToken = (process.env.AWS_SESSION_TOKEN || '').trim();

if (accessKeyId && !secretAccessKey) {
  console.warn('[DynamoDB] Advertencia: AWS_ACCESS_KEY_ID está definido pero falta AWS_SECRET_ACCESS_KEY.');
}
if (secretAccessKey && secretAccessKey.length !== 40) {
  console.warn(
    `[DynamoDB] Advertencia: AWS_SECRET_ACCESS_KEY tiene ${secretAccessKey.length} caracteres (una clave secreta IAM estándar tiene 40). Si ves InvalidSignatureException, revisa el valor en .env.`
  );
}

const clientConfig = {
  region,
  maxAttempts: 4,
};

if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

const client = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

module.exports = {
  client,
  docClient,
  interactionsTable: 'community360_interacciones',
  quarantineTable: 'community360_cuarentena',
};
