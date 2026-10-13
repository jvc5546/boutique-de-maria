// Run: node --test lambdas/api/test/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../src/catalog.mjs';
import { makeHandler, plain } from '../src/index.mjs';

const P = (id, extra) => ({
  id,
  status: 'active',
  priceStandard: 12000,
  pricePreferred: 10000,
  ...extra,
});

const records = [
  P('vainilla-bruma', { kind: 'mist', name: 'Bruma Vainilla', scent: 'Vainilla', stock: 12 }),
  P('vainilla-locion', { kind: 'lotion', name: 'Loción Vainilla', scent: 'Vainilla', stock: 2 }),
  P('vainilla-paquete', {
    kind: 'package', name: 'Paquete Vainilla', scent: 'Vainilla',
    priceStandard: 20000, pricePreferred: 17000,
    components: ['vainilla-bruma', 'vainilla-locion'],
  }),
  P('coco-bruma', { kind: 'mist', name: 'Bruma Coco', scent: 'Coco', stock: 5 }),
  P('coco-locion', { kind: 'lotion', name: 'Loción Coco', scent: 'Coco', stock: 0 }),
  P('coco-paquete', {
    kind: 'package', name: 'Paquete Coco', scent: 'Coco',
    components: ['coco-bruma', 'coco-locion'],
  }),
  P('viejo', { kind: 'mist', name: 'Archivado', scent: 'Coco', stock: 9, status: 'archived' }),
];

const standard = { role: 'distributor', tier: 'standard', status: 'active' };
const preferred = { role: 'distributor', tier: 'preferred', status: 'active' };
const admin = { role: 'admin', tier: 'preferred', status: 'active' };
const find = (list, id) => list.find((p) => p.id === id);

test('each tier sees its own price, and only one', () => {
  const s = find(buildCatalog(records, standard), 'vainilla-bruma');
  const p = find(buildCatalog(records, preferred), 'vainilla-bruma');
  assert.equal(s.price, 12000);
  assert.equal(p.price, 10000);
  assert.equal(s.prices, undefined);
});

test('admins see both prices', () => {
  const a = find(buildCatalog(records, admin), 'vainilla-paquete');
  assert.deepEqual(a.prices, { standard: 20000, preferred: 17000 });
});

test('package stock is its scarcest item', () => {
  const c = buildCatalog(records, standard);
  assert.equal(find(c, 'vainilla-paquete').stock, 2);
  assert.equal(find(c, 'vainilla-paquete').availability, 'low');
  assert.equal(find(c, 'coco-paquete').stock, 0);
  assert.equal(find(c, 'coco-paquete').availability, 'out');
  assert.equal(find(c, 'vainilla-bruma').availability, 'in');
});

test('archived products are hidden and make packages unavailable', () => {
  const c = buildCatalog(
    [...records.filter((p) => p.id !== 'vainilla-locion'),
      P('vainilla-locion', { kind: 'lotion', name: 'L', scent: 'Vainilla', stock: 50, status: 'archived' })],
    standard,
  );
  assert.equal(find(c, 'viejo'), undefined);
  assert.equal(find(c, 'vainilla-paquete').stock, 0);
  assert.deepEqual(find(c, 'vainilla-paquete').components.map((x) => x.id), ['vainilla-bruma']);
});

test('related = same scent, not itself', () => {
  const r = find(buildCatalog(records, standard), 'coco-bruma').related.map((x) => x.id);
  assert.deepEqual(r.sort(), ['coco-locion', 'coco-paquete']);
});

test('sorted by scent, items before packages', () => {
  const ids = buildCatalog(records, standard).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 3).map((id) => id.split('-')[0]), ['coco', 'coco', 'coco']);
  assert.equal(ids[2], 'coco-paquete');
  assert.equal(ids.at(-1), 'vainilla-paquete');
});

const db = {
  users: { 'jona@example.com': admin, 'old@example.com': { ...standard, status: 'removed' } },
  getUser: async (e) => db.users[e] ?? null,
  listProducts: async () => records,
  getSettings: async () => ({ ordersWhatsApp: '+18147691664' }),
};
const handler = makeHandler(db);
const ev = (routeKey, email) => ({ routeKey, requestContext: { authorizer: { jwt: { claims: { email } } } } });

test('GET /api/catalog for an active user', async () => {
  const res = await handler(ev('GET /api/catalog', 'Jona@Example.com'));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.products.length, 6);
  assert.equal(body.settings.ordersWhatsApp, '+18147691664');
});

test('removed or unknown users get 401 (never 403: CloudFront would hide it)', async () => {
  assert.equal((await handler(ev('GET /api/catalog', 'old@example.com'))).statusCode, 401);
  assert.equal((await handler(ev('GET /api/catalog', 'x@example.com'))).statusCode, 401);
  assert.equal((await handler(ev('GET /api/catalog', undefined))).statusCode, 401);
});

test('unknown route is 400', async () => {
  assert.equal((await handler(ev('GET /api/nada', 'jona@example.com'))).statusCode, 400);
});

test('items at zero for 60+ days leave the catalog; packages and restocked items stay', () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const recs = [
    P('old', { kind: 'mist', name: 'Old', scent: 'X', stock: 0, outOfStockSince: '2026-08-01T00:00:00Z' }),
    P('recent', { kind: 'mist', name: 'Recent', scent: 'X', stock: 0, outOfStockSince: '2026-10-01T00:00:00Z' }),
    P('pkg', { kind: 'package', name: 'Pkg', scent: 'X', components: ['old', 'recent'] }),
  ];
  const ids = buildCatalog(recs, standard, now).map((p) => p.id);
  assert.deepEqual(ids.sort(), ['pkg', 'recent']);
});

test('plain() converts DynamoDB JSON', () => {
  assert.deepEqual(
    plain({ a: { S: 'x' }, n: { N: '12000' }, l: { L: [{ S: 'p' }] }, b: { BOOL: true } }),
    { a: 'x', n: 12000, l: ['p'], b: true },
  );
});
