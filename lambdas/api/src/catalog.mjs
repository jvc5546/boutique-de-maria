// Catalog rules, with no AWS code so they can be tested directly.
//
// Product record (table bdm-main, pk = "PRODUCT", sk = <id>):
//   id, kind ("mist" | "lotion" | "package" | ...), name, description, scent,
//   size (free text, e.g. "250 ml"; optional)
//   priceStandard, pricePreferred   (integer cents, MXN)
//   stock                           (items only; packages have none of their own)
//   components                      (packages only: item ids inside)
//   status ("active" | "archived"), sort (number, optional)
//   photo ("media/products/<id>-<time>.webp", optional)
//   outOfStockSince (ISO time; set by the admin API when stock hits 0)
//
// Rules:
//   - A distributor sees one price: their tier's. Admins see both.
//   - A package is available as many times as its scarcest item allows,
//     so it's out of stock as soon as any item inside is.
//   - Items with the same scent are "related" (Misma fragancia).
//   - An item at zero stock for 60 days leaves the catalog on its own
//     (as if archived); restocking it brings it back.

export const LOW_STOCK = 3;
export const STALE_DAYS = 60;

export function isListed(p, now = Date.now()) {
  if (p.status !== 'active') return false;
  if (p.kind === 'package' || (p.stock ?? 0) > 0 || !p.outOfStockSince) return true;
  return now - Date.parse(p.outOfStockSince) < STALE_DAYS * 86_400_000;
}

export function buildCatalog(records, user, now = Date.now()) {
  const active = records.filter((p) => isListed(p, now));
  const byId = new Map(active.map((p) => [p.id, p]));
  const isAdmin = user.role === 'admin';

  const products = active.map((p) => {
    const isPackage = p.kind === 'package';
    const components = isPackage ? (p.components ?? []) : [];
    // A package whose item was archived or deleted can't be assembled: 0.
    const stock = isPackage
      ? components.length === 0
        ? 0
        : Math.min(...components.map((id) => byId.get(id)?.stock ?? 0))
      : Math.max(0, p.stock ?? 0);

    const out = {
      id: p.id,
      kind: p.kind,
      name: p.name,
      description: p.description ?? '',
      scent: p.scent ?? '',
      size: p.size ?? '',
      photo: p.photo ? `/${p.photo}` : '',
      price: priceFor(p, user),
      availability: stock <= 0 ? 'out' : stock <= LOW_STOCK ? 'low' : 'in',
      stock,
      components: components
        .filter((id) => byId.has(id))
        .map((id) => ({ id, name: byId.get(id).name })),
      related: active
        .filter((o) => o.id !== p.id && p.scent && o.scent === p.scent)
        .map((o) => ({ id: o.id, name: o.name })),
      sort: p.sort ?? 0,
    };
    if (isAdmin) out.prices = { standard: p.priceStandard, preferred: p.pricePreferred };
    return out;
  });

  // Group by scent, then items before packages, then the admin's chosen order.
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
