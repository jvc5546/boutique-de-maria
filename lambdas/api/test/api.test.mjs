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
  P('vainilla-mist', { kind: 'mist', name: 'Mist Vainilla', scent: 'Vainilla', stock: 12, photo: 'media/m.webp' }),
  P('vainilla-locion', { kind: 'lotion', name: 'Loción Vainilla', scent: 'Vainilla', stock: 2, photo: 'media/l.webp' }),
  P('coco-mist', { kind: 'mist', name: 'Mist Coco', scent: 'Coco', stock: 5 }),
  P('coco-locion', { kind: 'lotion', name: 'Loción Coco', scent: 'Coco', stock: 0 }),
  // An old hand-made package record: ignored now.
  P('coco-paquete', { kind: 'package', name: 'Paquete Coco viejo', scent: 'Coco', components: ['coco-mist', 'coco-locion'] }),
  P('viejo', { kind: 'mist', name: 'Archivado', scent: 'Coco', stock: 9, status: 'archived' }),
];

const settings = { packageDiscount: { one: { standard: 4000, preferred: 3000 }, all: { standard: 9000, preferred: 7000 } } };
const standard = { role: 'distributor', tier: 'standard', status: 'active' };
const preferred = { role: 'distributor', tier: 'preferred', status: 'active' };
const admin = { role: 'admin', tier: 'preferred', status: 'active' };
const find = (list, id) => list.find((p) => p.id === id);
const pkgs = (list) => list.filter((p) => p.kind === 'package');

test('each tier sees its own price, and only one', () => {
  const s = find(buildCatalog(records, standard), 'vainilla-mist');
  const p = find(buildCatalog(records, preferred), 'vainilla-mist');
  assert.equal(s.price, 12000);
  assert.equal(p.price, 10000);
  assert.equal(s.prices, undefined);
});

test('a scent with a lotion and a mist gets one automatic paquete, priced with the discount', () => {
  const c = buildCatalog(records, admin, Date.now(), settings);
  const v = find(c, 'paquete--vainilla-locion--vainilla-mist');
  assert.equal(v.name, 'Paquete Vainilla');
  assert.deepEqual(v.prices, { standard: 24000 - 4000, preferred: 20000 - 3000 });
  assert.equal(v.photo, '/media/l.webp'); // the lotion's photo
  assert.deepEqual(v.components.map((x) => x.id), ['vainilla-locion', 'vainilla-mist']);
  assert.equal(find(c, 'coco-paquete'), undefined); // stored packages are ignored
  assert.equal(pkgs(c).length, 2);
});

test('no discount set: paquete costs the sum of its items', () => {
  const v = find(buildCatalog(records, standard), 'paquete--vainilla-locion--vainilla-mist');
  assert.equal(v.price, 24000);
});

test('shimmer: lotion + each mist, plus a "completo" with every mist', () => {
  const recs = [
    P('ar-locion', { kind: 'lotion', name: 'Loción Amber Romance', scent: 'Amber Romance', stock: 9 }),
    P('ar-mist', { kind: 'mist', name: 'Mist Amber Romance', scent: 'Amber Romance', stock: 8 }),
    P('ar-shimmer', { kind: 'mist', name: 'Mist Amber Romance Shimmer', scent: 'Amber Romance', stock: 2 }),
  ];
  const c = pkgs(buildCatalog(recs, standard, Date.now(), settings));
  assert.deepEqual(c.map((p) => p.name), [
    'Paquete Amber Romance (Loción + Mist)',
    'Paquete Amber Romance (Loción + Mist Shimmer)',
    'Paquete completo Amber Romance',
  ]);
  assert.equal(c[2].price, 36000 - 9000);
  assert.equal(c[2].stock, 2);
  assert.equal(c[0].price, 24000 - 4000);
});

test('paquete stock is its scarcest item; sold-out items make it sold out', () => {
  const c = buildCatalog(records, standard);
  const v = find(c, 'paquete--vainilla-locion--vainilla-mist');
  assert.equal(v.stock, 2);
  assert.equal(v.availability, 'low');
  assert.equal(find(c, 'paquete--coco-locion--coco-mist').availability, 'out');
  assert.equal(find(c, 'vainilla-mist').availability, 'in');
});

test('archived items are hidden and take their paquetes with them', () => {
  const c = buildCatalog(
    [...records.filter((p) => p.id !== 'vainilla-locion'),
      P('vainilla-locion', { kind: 'lotion', name: 'L', scent: 'Vainilla', stock: 50, status: 'archived' })],
    standard,
  );
  assert.equal(find(c, 'viejo'), undefined);
  assert.equal(find(c, 'paquete--vainilla-locion--vainilla-mist'), undefined);
});

test('related = same scent (items and paquetes), not itself', () => {
  const r = find(buildCatalog(records, standard), 'coco-mist').related.map((x) => x.id);
  assert.deepEqual(r.sort(), ['coco-locion', 'paquete--coco-locion--coco-mist']);
});

test('sorted by scent, items before paquetes', () => {
  const ids = buildCatalog(records, standard).map((p) => p.id);
  assert.deepEqual(ids, ['coco-locion', 'coco-mist', 'paquete--coco-locion--coco-mist',
    'vainilla-locion', 'vainilla-mist', 'paquete--vainilla-locion--vainilla-mist']);
});

const db = {
  users: { 'jona@example.com': admin, 'old@example.com': { ...standard, status: 'removed' } },
  getUser: async (e) => db.users[e] ?? null,
  listProducts: async () => records,
  getSettings: async () => ({ ordersWhatsApp: '+18147691664', ...settings }),
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

test('items at zero for 60+ days leave the catalog; recent ones stay', () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const recs = [
    P('old', { kind: 'mist', name: 'Old', scent: 'X', stock: 0, outOfStockSince: '2026-08-01T00:00:00Z' }),
    P('recent', { kind: 'mist', name: 'Recent', scent: 'X', stock: 0, outOfStockSince: '2026-10-01T00:00:00Z' }),
  ];
  const ids = buildCatalog(recs, standard, now).map((p) => p.id);
  assert.deepEqual(ids, ['recent']);
});

test('plain() converts DynamoDB JSON', () => {
  assert.deepEqual(
    plain({ a: { S: 'x' }, n: { N: '12000' }, l: { L: [{ S: 'p' }] }, b: { BOOL: true } }),
    { a: 'x', n: 12000, l: ['p'], b: true },
  );
});

test('sections: products carry their section; only sections with products are listed', async () => {
  const res = await handler(ev('GET /api/catalog', 'jona@example.com'));
  const body = JSON.parse(res.body);
  assert.deepEqual(body.departments.map((d) => d.id), ['lociones']);
  assert.ok(body.products.every((p) => p.department === 'lociones'));
  const withTest = buildCatalog([...records, P('t1', { kind: 'test', name: 'Test 1 rojo', stock: 3 })], standard);
  assert.equal(find(withTest, 't1').department, 'prueba');
  assert.equal(find(withTest, 't1').related.length, 0);
});

test('distributors are not told their level; admins are', async () => {
  const h2 = makeHandler({ ...db, users: undefined, getUser: async (e) => (e === 'ana@example.com' ? { ...preferred, name: 'Ana' } : admin) });
  const ana = JSON.parse((await h2(ev('GET /api/catalog', 'ana@example.com'))).body);
  assert.equal(ana.user.tier, undefined);
  assert.equal(ana.user.role, 'distributor');
  const jona = JSON.parse((await h2(ev('GET /api/catalog', 'jona@example.com'))).body);
  assert.equal(jona.user.tier, 'preferred');
});
