// bdm-api: the site's API, behind API Gateway (HTTP API) at /api/*.
//
// API Gateway has already checked the Cognito token (JWT authorizer) before
// this runs. Here we look the person up in the table on every request, so a
// tier change or removal takes effect immediately, not at the next token.
//
// Status codes: CloudFront swaps 403 and 404 responses for the site's 404
// page, so the API answers 401 for "not allowed" and 400 for "no such thing".

import { buildCatalog } from './catalog.mjs';

export function makeHandler(db) {
  return async function handler(event) {
    const email = String(event.requestContext?.authorizer?.jwt?.claims?.email ?? '')
      .trim()
      .toLowerCase();
    const user = email ? await db.getUser(email) : null;
    if (!user || user.status !== 'active') return json(401, { error: 'no-invitado' });

    switch (event.routeKey) {
      case 'GET /api/catalog': {
        const products = buildCatalog(await db.listProducts(), user);
        return json(200, {
          user: { name: user.name ?? '', role: user.role, tier: user.tier ?? '' },
          products,
        });
      }
      default:
        return json(400, { error: 'ruta-desconocida' });
    }
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// --- DynamoDB (SDK included in the Lambda runtime; loaded lazily for tests)

let client;
async function ddb() {
  const sdk = await import('@aws-sdk/client-dynamodb');
  client ??= new sdk.DynamoDBClient({});
  return { sdk, client };
}

const TABLE = () => process.env.TABLE_NAME;

const dynamoDb = {
  async getUser(email) {
    const { sdk, client } = await ddb();
    const out = await client.send(
      new sdk.GetItemCommand({
        TableName: TABLE(),
        Key: { pk: { S: `USER#${email}` }, sk: { S: 'PROFILE' } },
      }),
    );
    return out.Item ? plain(out.Item) : null;
  },

  async listProducts() {
    const { sdk, client } = await ddb();
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(
        new sdk.QueryCommand({
          TableName: TABLE(),
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': { S: 'PRODUCT' } },
          ExclusiveStartKey,
        }),
      );
      items.push(...out.Items.map(plain));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  },
};

// DynamoDB's typed JSON ({ S: "x" }, { N: "1" }, { L: [...] }) -> plain values.
export function plain(item) {
  const value = (v) =>
    'S' in v ? v.S
    : 'N' in v ? Number(v.N)
    : 'BOOL' in v ? v.BOOL
    : 'NULL' in v ? null
    : 'L' in v ? v.L.map(value)
    : 'SS' in v ? v.SS
    : 'M' in v ? plain(v.M)
    : undefined;
  return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, value(v)]));
}

export const handler = makeHandler(dynamoDb);
