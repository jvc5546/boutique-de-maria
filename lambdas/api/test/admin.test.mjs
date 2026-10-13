// Run: node --test lambdas/api/test/admin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, typed, plain } from '../src/index.mjs';
import { normalizePhone, slugify, validatePhoto, validateProduct } from '../src/validate.mjs';

const NOW = '2026-10-12T12:00:00.000Z';

function fakeDb() {
  const db = {
    users: {
      'jona@example.com': { email: 'jona@example.com', name: 'Jona', role: 'admin', tier: 'preferred', status: 'active' },
      'ana@example.com': { email: 'ana@example.com', name: 'Ana', role: 'distributor', tier: 'standard', status: 'active' },
    },
    products: [
      { id: 'bruma-vainilla', kind: 'mist', name: 'Bruma Vainilla', scent: 'Vainilla', priceStandard: 12000, pricePreferred: 10000, stock: 5, status: 'active' },
      { id: 'locion-vainilla', kind: 'lotion', name: 'Loción Vainilla', scent: 'Vainilla', priceStandard: 12000, pricePreferred: 10000, stock: 5, status: 'active' },
    ],
    settings: null,
    photos: {},
    getUser: async (e) => db.users[e] ?? null,
    listUsers: async () => Object.values(db.users),
    putUser: async (u) => { db.users[u.email] = u; },
    listProducts: async () => db.products,
    putProduct: async (p) => { db.products = [...db.products.filter((x) => x.id !== p.id), p]; },
    getSettings: async () => db.settings,
    putSettings: async (s) => { db.settings = s; },
    putPhoto: async (k, b, t) => { db.photos[k] = t; },
  };
  return db;
}

const call = (handler, routeKey, email, { body, params } = {}) =>
  handler({
    routeKey,
    pathParameters: params,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { email } } } },
  }).then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

const setup = () => {
  const db = fakeDb();
  return { db, handler: makeHandler(db, () => new Date(NOW)) };
};

const newMist = { name: 'Bruma Coco Ñandú', kind: 'mist', scent: 'Coco', description: '', priceStandard: 12000, pricePreferred: 10000, stock: 3 };

test('distributors cannot use admin routes (401 solo-admin)', async () => {
  const { handler } = setup();
  const r = await call(handler, 'GET /api/admin/products', 'ana@example.com');
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'solo-admin');
});

test('create a product: id from the name, accents removed, unique', async () => {
  const { handler, db } = setup();
  const a = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: newMist });
  const b = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: newMist });
  assert.equal(a.body.product.id, 'bruma-coco-nandu');
  assert.equal(b.body.product.id, 'bruma-coco-nandu-2');
  assert.equal(db.products.length, 4);
});

test('package rules: 2+ existing items, no nested packages, no own stock', async () => {
  const { handler } = setup();
  const pkg = { name: 'Paquete Vainilla', kind: 'package', scent: 'Vainilla', priceStandard: 20000, pricePreferred: 17000, components: ['bruma-vainilla', 'locion-vainilla'], stock: 99 };
  const ok = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: pkg });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.product.stock, undefined);
  const one = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: { ...pkg, components: ['bruma-vainilla'] } });
  assert.equal(one.status, 400);
  const nested = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: { ...pkg, components: ['bruma-vainilla', 'paquete-vainilla'] } });
  assert.equal(nested.status, 400);
});

test('preferred price cannot exceed standard', async () => {
  const { handler } = setup();
  const r = await call(handler, 'POST /api/admin/products', 'jona@example.com', { body: { ...newMist, pricePreferred: 13000 } });
  assert.equal(r.status, 400);
});

test('stock to zero records the date once; restock clears it', async () => {
  const { handler, db } = setup();
  const base = { ...newMist, name: 'Bruma Vainilla', scent: 'Vainilla' };
  await call(handler, 'PUT /api/admin/products/{id}', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { ...base, stock: 0 } });
  assert.equal(db.products.find((p) => p.id === 'bruma-vainilla').outOfStockSince, NOW);
  const later = makeHandler(db, () => new Date('2026-11-01T00:00:00Z'));
  await call(later, 'PUT /api/admin/products/{id}', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { ...base, stock: 0, name: 'Renamed' } });
  assert.equal(db.products.find((p) => p.id === 'bruma-vainilla').outOfStockSince, NOW);
  await call(handler, 'PUT /api/admin/products/{id}', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { ...base, stock: 4 } });
  assert.equal(db.products.find((p) => p.id === 'bruma-vainilla').outOfStockSince, undefined);
});

test('editing keeps the photo and creation date', async () => {
  const { handler, db } = setup();
  db.products[0] = { ...db.products[0], photo: 'media/products/x.webp', createdAt: '2026-01-01T00:00:00Z' };
  await call(handler, 'PUT /api/admin/products/{id}', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { ...newMist, photo: 'media/evil.webp' } });
  const p = db.products.find((x) => x.id === 'bruma-vainilla');
  assert.equal(p.photo, 'media/products/x.webp');
  assert.equal(p.createdAt, '2026-01-01T00:00:00Z');
});

test('photo upload: WebP accepted and stored under a fresh name; other files refused', async () => {
  const { handler, db } = setup();
  const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 '), Buffer.alloc(20)]).toString('base64');
  const ok = await call(handler, 'POST /api/admin/products/{id}/photo', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { data: webp } });
  assert.equal(ok.status, 200);
  assert.match(ok.body.photo, /^\/media\/products\/bruma-vainilla-\d+\.webp$/);
  assert.equal(db.photos[ok.body.photo.slice(1)], 'image/webp');
  const html = Buffer.from('<html><script>').toString('base64');
  assert.equal((await call(handler, 'POST /api/admin/products/{id}/photo', 'jona@example.com', { params: { id: 'bruma-vainilla' }, body: { data: html } })).status, 400);
});

test('distributors: add, change tier, remove; admins are off-limits', async () => {
  const { handler, db } = setup();
  const add = await call(handler, 'PUT /api/admin/users/{email}', 'jona@example.com', { params: { email: 'Luis%40Example.com' }, body: { name: 'Luis', tier: 'preferred', status: 'active' } });
  assert.equal(add.status, 200);
  assert.equal(db.users['luis@example.com'].role, 'distributor');
  await call(handler, 'PUT /api/admin/users/{email}', 'jona@example.com', { params: { email: 'luis@example.com' }, body: { name: 'Luis', tier: 'standard', status: 'removed' } });
  assert.equal(db.users['luis@example.com'].status, 'removed');
  const admin = await call(handler, 'PUT /api/admin/users/{email}', 'jona@example.com', { params: { email: 'jona@example.com' }, body: { name: 'X', tier: 'standard', status: 'removed' } });
  assert.equal(admin.status, 400);
  assert.equal(db.users['jona@example.com'].status, 'active');
});

test('settings: WhatsApp number needs + and a country code, never assumed', async () => {
  const { handler, db } = setup();
  assert.equal((await call(handler, 'PUT /api/admin/settings', 'jona@example.com', { body: { ordersWhatsApp: '55 1234 5678' } })).status, 400);
  const ok = await call(handler, 'PUT /api/admin/settings', 'jona@example.com', { body: { ordersWhatsApp: '+52 (55) 1234-5678' } });
  assert.equal(ok.status, 200);
  assert.equal(db.settings.ordersWhatsApp, '+525512345678');
  assert.equal(normalizePhone('+1 814 769 1664'), '+18147691664');
  assert.equal(normalizePhone('0052 55 1234 5678'), '+525512345678');
});

test('helpers', () => {
  assert.equal(slugify('  Loción Corporal: Frutos Rojos!! '), 'locion-corporal-frutos-rojos');
  assert.deepEqual(plain(typed({ a: 'x', n: 1, l: ['p'], b: false, m: { k: 'v' }, u: undefined })), { a: 'x', n: 1, l: ['p'], b: false, m: { k: 'v' } });
  assert.ok(validatePhoto({ data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]).toString('base64') }).value);
  assert.ok(validateProduct('Bad Id', {}, { now: NOW }).error);
});
