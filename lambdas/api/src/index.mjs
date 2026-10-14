// bdm-api: the site's API, behind API Gateway (HTTP API) at /api/*.
//
// API Gateway has already checked the Cognito token (JWT authorizer) before
// this runs. Here we look the person up in the table on every request, so a
// tier change, removal or admin change takes effect immediately.
//
// Status codes: CloudFront swaps 403 and 404 responses for the site's 404
// page, so the API answers 401 for "not allowed" (no-invitado / solo-admin)
// and 400 for anything wrong with the request.

import { buildCatalog, isListed } from './catalog.mjs';
import { slugify, validatePhoto, validateProduct, validateSettings, validateUser } from './validate.mjs';

export function makeHandler(db, clock = () => new Date()) {
  return async function handler(event) {
    const email = String(event.requestContext?.authorizer?.jwt?.claims?.email ?? '')
      .trim()
      .toLowerCase();
    const user = email ? await db.getUser(email) : null;
    if (!user || user.status !== 'active') return json(401, { error: 'no-invitado' });

    const route = event.routeKey ?? '';
    const now = clock().toISOString();

    if (route === 'GET /api/catalog') {
      const [records, settings] = await Promise.all([db.listProducts(), db.getSettings()]);
      return json(200, {
        user: { name: user.name ?? '', role: user.role, tier: user.tier ?? '' },
        settings: { ordersWhatsApp: settings?.ordersWhatsApp ?? '' },
        products: buildCatalog(records, user, Date.parse(now)),
      });
    }

    if (!route.includes(' /api/admin/')) return json(400, { error: 'ruta-desconocida' });
    if (user.role !== 'admin') return json(401, { error: 'solo-admin' });

    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
      } catch {
        return json(400, { error: 'JSON inválido.' });
      }
    }
    const param = (name) => {
      try {
        return decodeURIComponent(event.pathParameters?.[name] ?? '');
      } catch {
        return '';
      }
    };

    switch (route) {
      case 'GET /api/admin/products': {
        const now_ = Date.parse(now);
        const products = (await db.listProducts())
          .map((p) => ({ ...p, listed: isListed(p, now_) }))
          .sort((a, b) => (a.scent ?? '').localeCompare(b.scent ?? '', 'es') || (a.sort ?? 0) - (b.sort ?? 0));
        return json(200, { products });
      }

      case 'POST /api/admin/products': {
        // New product: the id comes from the name (Bruma Vainilla -> bruma-vainilla).
        const products = await db.listProducts();
        const taken = new Set(products.map((p) => p.id));
        const base = slugify(body.name) || 'producto';
        let id = base;
        for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
        const { value, error } = validateProduct(id, body, { products, now });
        if (error) return json(400, { error });
        await db.putProduct(value);
        return json(200, { product: value });
      }

      case 'PUT /api/admin/products/{id}': {
        const id = param('id');
        const products = await db.listProducts();
        const existing = products.find((p) => p.id === id);
        if (!existing) return json(400, { error: 'Ese producto no existe.' });
        const { value, error } = validateProduct(id, body, { existing, products, now });
        if (error) return json(400, { error });
        await db.putProduct(value);
        return json(200, { product: value });
      }

      case 'POST /api/admin/products/{id}/photo': {
        const id = param('id');
        const existing = (await db.listProducts()).find((p) => p.id === id);
        if (!existing) return json(400, { error: 'Ese producto no existe.' });
        const { value, error } = validatePhoto(body);
        if (error) return json(400, { error });
        // A new name per upload, so browsers and CloudFront can cache photos forever.
        const key = `media/products/${id}-${Date.parse(now)}.${value.ext}`;
        await db.putPhoto(key, value.bytes, value.contentType);
        await db.putProduct({ ...existing, photo: key, updatedAt: now });
        return json(200, { photo: `/${key}` });
      }

      case 'GET /api/admin/users': {
        const users = (await db.listUsers()).sort(
          (a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || (a.name ?? '').localeCompare(b.name ?? '', 'es'),
        );
        return json(200, { users });
      }

      case 'PUT /api/admin/users/{email}': {
        const target = param('email').toLowerCase();
        const existing = await db.getUser(target);
        const { value, error } = validateUser(target, body, { existing, now });
        if (error) return json(400, { error });
        await db.putUser(value);
        return json(200, { user: value });
      }

      // Removing someone deletes their record: no record, no way in. Admins
      // live in Terraform (ADMINS) and can't be deleted from here.
      case 'DELETE /api/admin/users/{email}': {
        const target = param('email').toLowerCase();
        const existing = await db.getUser(target);
        if (!existing) return json(400, { error: 'Ese correo no está en la lista.' });
        if (existing.role === 'admin') return json(400, { error: 'Las cuentas de administración se cambian en Terraform.' });
        await db.deleteUser(target);
        return json(200, { deleted: target });
      }

      case 'GET /api/admin/settings':
        return json(200, { settings: (await db.getSettings()) ?? { ordersWhatsApp: '' } });

      case 'PUT /api/admin/settings': {
        const { value, error } = validateSettings(body, { now });
        if (error) return json(400, { error });
        await db.putSettings(value);
        return json(200, { settings: value });
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

// --- DynamoDB's typed JSON <-> plain values ------------------------------

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

export function typed(obj) {
  const value = (v) =>
    typeof v === 'string' ? { S: v }
    : typeof v === 'number' ? { N: String(v) }
    : typeof v === 'boolean' ? { BOOL: v }
    : Array.isArray(v) ? { L: v.map(value) }
    : v && typeof v === 'object' ? { M: typed(v) }
    : { NULL: true };
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, value(v)]),
  );
}

// --- AWS (SDK included in the Lambda runtime; loaded lazily for tests) -----

let clients;
async function aws() {
  if (!clients) {
    const [ddb, s3] = await Promise.all([import('@aws-sdk/client-dynamodb'), import('@aws-sdk/client-s3')]);
    clients = { ddb, s3, dynamo: new ddb.DynamoDBClient({}), s3c: new s3.S3Client({}) };
  }
  return clients;
}

const TABLE = () => process.env.TABLE_NAME;

async function queryAll(input) {
  const { ddb, dynamo } = await aws();
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await dynamo.send(new ddb.QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...out.Items.map(plain));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getItem(pk, sk) {
  const { ddb, dynamo } = await aws();
  const out = await dynamo.send(new ddb.GetItemCommand({ TableName: TABLE(), Key: typed({ pk, sk }) }));
  return out.Item ? plain(out.Item) : null;
}

async function putItem(item) {
  const { ddb, dynamo } = await aws();
  await dynamo.send(new ddb.PutItemCommand({ TableName: TABLE(), Item: typed(item) }));
}

const dynamoDb = {
  getUser: (email) => getItem(`USER#${email}`, 'PROFILE'),
  listUsers: () =>
    queryAll({
      TableName: TABLE(),
      IndexName: 'by-type',
      KeyConditionExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': { S: 'user' } },
    }),
  putUser: (user) => putItem(user),
  deleteUser: async (email) => {
    const { ddb, dynamo } = await aws();
    await dynamo.send(new ddb.DeleteItemCommand({ TableName: TABLE(), Key: typed({ pk: `USER#${email}`, sk: 'PROFILE' }) }));
  },

  listProducts: () =>
    queryAll({
      TableName: TABLE(),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'PRODUCT' } },
    }),
  putProduct: (p) => putItem({ ...p, pk: 'PRODUCT', sk: p.id, type: 'product' }),

  getSettings: () => getItem('SETTINGS', 'GLOBAL'),
  putSettings: (s) => putItem({ ...s, pk: 'SETTINGS', sk: 'GLOBAL', type: 'settings' }),

  async putPhoto(key, bytes, contentType) {
    const { s3, s3c } = await aws();
    await s3c.send(
      new s3.PutObjectCommand({
        Bucket: process.env.SITE_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  },
};

export const handler = makeHandler(dynamoDb);
