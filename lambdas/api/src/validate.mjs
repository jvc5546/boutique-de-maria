// Input checks for the admin API. Each function returns { value } with the
// cleaned-up record, or { error } with a short Spanish message for the form.

export const KINDS = ['mist', 'lotion', 'package', 'other'];
export const TIERS = ['preferred', 'standard'];
const MAX_CENTS = 10_000_000; // $100,000.00
const MAX_STOCK = 100_000;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function slugify(text) {
  return str(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // á -> a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * input: the form's fields. existing: the stored record (null when new).
 * products: every product, to check package contents. now: ISO timestamp.
 */
export function validateProduct(id, input, { existing = null, products = [], now }) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(id ?? '')) return { error: 'Identificador inválido.' };
  const name = str(input.name);
  if (!name || name.length > 80) return { error: 'El nombre es obligatorio (máximo 80 caracteres).' };
  const kind = str(input.kind);
  if (!KINDS.includes(kind)) return { error: 'Tipo de producto inválido.' };
  const scent = str(input.scent);
  if (scent.length > 40) return { error: 'La fragancia admite máximo 40 caracteres.' };
  const size = str(input.size);
  if (size.length > 20) return { error: 'El tamaño admite máximo 20 caracteres (por ejemplo 250 ml).' };
  const description = str(input.description);
  if (description.length > 400) return { error: 'La descripción admite máximo 400 caracteres.' };
  for (const k of ['priceStandard', 'pricePreferred']) {
    if (!isInt(input[k], 0, MAX_CENTS)) return { error: 'Los precios deben ser cantidades válidas.' };
  }
  if (input.pricePreferred > input.priceStandard) {
    return { error: 'El precio Preferente no puede ser mayor que el Estándar.' };
  }
  const status = input.status === 'archived' ? 'archived' : 'active';
  const sort = isInt(input.sort, 0, 9999) ? input.sort : 0;

  const value = {
    id, type: 'product', kind, name, description, scent, size,
    priceStandard: input.priceStandard, pricePreferred: input.pricePreferred,
    status, sort, updatedAt: now,
  };
  if (existing?.photo) value.photo = existing.photo; // photos change only through upload
  value.createdAt = existing?.createdAt ?? now;

  if (kind === 'package') {
    const ids = Array.isArray(input.components) ? [...new Set(input.components.map(str))] : [];
    if (ids.length < 2 || ids.length > 10) return { error: 'Un paquete incluye de 2 a 10 productos.' };
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const c of ids) {
      const p = byId.get(c);
      if (!p || p.id === id) return { error: 'El paquete incluye un producto que no existe.' };
      if (p.kind === 'package') return { error: 'Un paquete no puede incluir otro paquete.' };
    }
    value.components = ids;
  } else {
    if (!isInt(input.stock, 0, MAX_STOCK)) return { error: 'Las existencias deben ser un número entero.' };
    value.stock = input.stock;
    // Remember when an item ran out: after 60 days at zero it leaves the catalog.
    if (input.stock === 0) value.outOfStockSince = existing?.stock === 0 && existing?.outOfStockSince ? existing.outOfStockSince : now;
  }
  return { value };
}

export function validateUser(email, input, { existing = null, now }) {
  const e = str(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 120) return { error: 'Correo inválido.' };
  if (existing?.role === 'admin') return { error: 'Las cuentas de administración se cambian en Terraform.' };
  const name = str(input.name);
  if (!name || name.length > 60) return { error: 'El nombre es obligatorio (máximo 60 caracteres).' };
  if (!TIERS.includes(input.tier)) return { error: 'Nivel inválido.' };
  // Everyone on the list can enter; to keep someone out, delete them.
  const status = 'active';
  return {
    value: {
      pk: `USER#${e}`, sk: 'PROFILE', type: 'user', email: e, name, role: 'distributor',
      tier: input.tier, status, createdAt: existing?.createdAt ?? now, updatedAt: now,
    },
  };
}

/** Phone in international format: +, country code, number. No country is assumed. */
export function normalizePhone(raw) {
  const s = str(raw).replace(/[\s().-]/g, '');
  const withPlus = s.startsWith('00') ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

export function validateSettings(input, { now }) {
  const ordersWhatsApp = normalizePhone(input.ordersWhatsApp);
  if (!ordersWhatsApp) {
    return { error: 'Escribe el número con + y código de país, por ejemplo +52 55 1234 5678.' };
  }
  return { value: { ordersWhatsApp, updatedAt: now } };
}

/** Photos arrive already resized by the browser. Accept only real WebP or JPEG. */
export function validatePhoto(input) {
  const MAX_BYTES = 2 * 1024 * 1024;
  if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) {
    return { error: 'La foto pesa demasiado (máximo 2 MB).' };
  }
  const bytes = Buffer.from(input.data, 'base64');
  const isWebp = bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isWebp && !isJpeg) return { error: 'La foto debe ser WebP o JPEG.' };
  return { value: { bytes, contentType: isWebp ? 'image/webp' : 'image/jpeg', ext: isWebp ? 'webp' : 'jpg' } };
}
