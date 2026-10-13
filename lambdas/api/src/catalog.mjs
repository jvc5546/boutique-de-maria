// Catalog rules, with no AWS code so they can be tested directly.
//
// Product record (table bdm-main, pk = "PRODUCT", sk = <id>):
//   id, kind ("mist" | "lotion" | "package" | ...), name, description, scent,
//   priceStandard, pricePreferred   (integer cents, MXN)
//   stock                           (items only; packages have none of their own)
//   components                      (packages only: item ids inside)
//   status ("active" | "archived"), sort (number, optional)
//
// Rules:
//   - A distributor sees one price: their tier's. Admins see both.
//   - A package is available as many times as its scarcest item allows,
//     so it's out of stock as soon as any item inside is.
//   - Items with the same scent are "related" (Misma fragancia).

export const LOW_STOCK = 3;

export function buildCatalog(records, user) {
  const active = records.filter((p) => p.status === 'active');
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
