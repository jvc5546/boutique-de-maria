// Catalog rules, with no AWS code so they can be tested directly.
//
// Product record (table bdm-main, pk = "PRODUCT", sk = <id>):
//   id, kind ("mist" | "lotion" | "other"), name, description, scent,
//   size (free text, e.g. "250 ml"; optional)
//   priceStandard, pricePreferred   (integer cents, MXN)
//   stock
//   status ("active" | "archived"), sort (number, optional)
//   photo ("media/products/<id>-<time>.webp", optional)
//   outOfStockSince (ISO time; set by the admin API when stock hits 0)
//
// Rules:
//   - A distributor sees one price: their tier's. Admins see both.
//   - Paquetes are never stored: for each scent, every lotion pairs with
//     each mist ("Loción + 1 mist"), and when a scent has 2+ mists, the lotion
//     also comes with all of them ("Paquete completo"). Price = the items'
//     prices added up, minus the discount set in Ajustes for that kind of
//     paquete (per tier). Stock = the scarcest item inside.
//   - Old package records saved by hand (before paquetes were automatic)
//     are ignored.
//   - Items with the same scent are "related" (Misma fragancia).
//   - An item at zero stock for 60 days leaves the catalog on its own
//     (as if archived); restocking it brings it back.

export const LOW_STOCK = 3;
export const STALE_DAYS = 60;

export function isListed(p, now = Date.now()) {
  if (p.status !== 'active' || p.kind === 'package') return false;
  if ((p.stock ?? 0) > 0 || !p.outOfStockSince) return true;
  return now - Date.parse(p.outOfStockSince) < STALE_DAYS * 86_400_000;
}

const ZERO = { standard: 0, preferred: 0 };
export function discounts(settings) {
  const d = settings?.packageDiscount ?? {};
  return { one: { ...ZERO, ...d.one }, all: { ...ZERO, ...d.all } };
}

// "Mist Amber Romance Shimmer" -> "Mist Shimmer": the name without the scent.
function short(p) {
  const scent = (p.scent ?? '').toLowerCase();
  const i = scent ? p.name.toLowerCase().indexOf(scent) : -1;
  const s = (i >= 0 ? p.name.slice(0, i) + p.name.slice(i + scent.length) : p.name).replace(/\s+/g, ' ').trim();
  return s || p.name;
}

/** The automatic paquetes for a list of listed items. */
export function buildPackages(items, settings) {
  const disc = discounts(settings);
  const byScent = new Map();
  for (const p of items) {
    if (!p.scent || (p.kind !== 'lotion' && p.kind !== 'mist')) continue;
    const g = byScent.get(p.scent) ?? { lotions: [], mists: [] };
    (p.kind === 'lotion' ? g.lotions : g.mists).push(p);
    byScent.set(p.scent, g);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  const out = [];
  for (const [scent, { lotions, mists }] of byScent) {
    lotions.sort(byName);
    mists.sort(byName);
    const simple = lotions.length === 1 && mists.length === 1;
    for (const lotion of lotions) {
      const make = (kind, list, name) => {
        const add = (k) => list.reduce((sum, p) => sum + (p[k] ?? 0), 0);
        out.push({
          id: ['paquete', ...list.map((p) => p.id)].join('--'),
          kind: 'package',
          packageKind: kind, // "one" | "all"
          name,
          scent,
          description: '',
          status: 'active',
          priceStandard: Math.max(0, add('priceStandard') - disc[kind].standard),
          pricePreferred: Math.max(0, add('pricePreferred') - disc[kind].preferred),
          components: list.map((p) => p.id),
          sort: (kind === 'one' ? 1000 : 2000) + out.length, // keep this order: regular, shimmer, completo
        });
      };
      for (const mist of mists) {
        make('one', [lotion, mist], simple ? `Paquete ${scent}` : `Paquete ${scent} (${short(lotion)} + ${short(mist)})`);
      }
      if (mists.length >= 2) {
        make('all', [lotion, ...mists], `Paquete completo ${scent}${lotions.length > 1 ? ` (${short(lotion)})` : ''}`);
      }
    }
  }
  return out;
}

export function buildCatalog(records, user, now = Date.now(), settings = null) {
  const items = records.filter((p) => isListed(p, now));
  const all = [...items, ...buildPackages(items, settings)];
  const byId = new Map(items.map((p) => [p.id, p]));
  const isAdmin = user.role === 'admin';

  const products = all.map((p) => {
    const isPackage = p.kind === 'package';
    const components = isPackage ? p.components.map((id) => byId.get(id)) : [];
    const stock = isPackage ? Math.min(...components.map((c) => Math.max(0, c.stock ?? 0))) : Math.max(0, p.stock ?? 0);
    const lotion = components.find((c) => c.kind === 'lotion');

    const out = {
      id: p.id,
      kind: p.kind,
      name: p.name,
      description: p.description ?? '',
      scent: p.scent ?? '',
      size: p.size ?? '',
      photo: (isPackage ? lotion?.photo : p.photo) ? `/${isPackage ? lotion.photo : p.photo}` : '',
      price: priceFor(p, user),
      availability: stock <= 0 ? 'out' : stock <= LOW_STOCK ? 'low' : 'in',
      stock,
      components: components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, photo: c.photo ? `/${c.photo}` : '' })),
      related: all
        .filter((o) => o.id !== p.id && p.scent && o.scent === p.scent)
        .map((o) => ({ id: o.id, name: o.name })),
      sort: p.sort ?? 0,
    };
    if (isAdmin) out.prices = { standard: p.priceStandard, preferred: p.pricePreferred };
    return out;
  });

  // Group by scent, then items before paquetes, then name.
  products.sort(
    (a, b) =>
      a.scent.localeCompare(b.scent, 'es') ||
      Number(a.kind === 'package') - Number(b.kind === 'package') ||
      a.sort - b.sort ||
      a.name.localeCompare(b.name, 'es'),
  );
  return products;
}

export function priceFor(product, user) {
  return user.tier === 'preferred' || user.role === 'admin'
    ? product.pricePreferred
    : product.priceStandard;
}
