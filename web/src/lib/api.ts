// Calls to the site's API (/api/*), with the signed-in person's ID token.
// API Gateway rejects missing or invalid tokens; the API itself answers 401
// "no-invitado" for people who were removed from the list.

import { clearSession, getIdToken, leave } from './auth';

/** message: the API's explanation (Spanish, ready to show) when it gave one. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message = '') {
    super(message || `Error ${status}`);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await getIdToken();
  if (!token) return goTo('/');

  const { json, ...rest } = init;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(rest.headers as Record<string, string>), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (body.error === 'solo-admin') throw new ApiError(401, 'Esta sección es solo para administración.');
    if (body.error === 'no-invitado') {
      leave('no-invitado'); // also ends Cognito's session, so another account can sign in
      return new Promise(() => {});
    }
    clearSession();
    return goTo('/');
  }
  if (!res.ok) {
    // A 403/404 without JSON came from CloudFront or the firewall, not the API.
    const fallback = res.status === 404 || res.status === 403 ? 'El servidor rechazó la solicitud. Intenta de nuevo o avísale a Jona.' : '';
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : fallback);
  }
  return body as T;
}

function goTo(to: string): Promise<never> {
  location.replace(to);
  return new Promise(() => {}); // the page is navigating away
}

// --- Catalog types (mirror lambdas/api/src/catalog.mjs)

export type Kind = 'mist' | 'lotion' | 'package' | string;

export interface Product {
  id: string;
  kind: Kind;
  name: string;
  description: string;
  scent: string;
  size: string; // "250 ml" or ""
  photo: string; // "/media/products/..." or ""
  price: number; // cents, MXN
  prices?: { standard: number; preferred: number }; // admins only
  availability: 'in' | 'low' | 'out';
  stock: number;
  components: { id: string; name: string; kind: Kind; photo: string }[];
  related: { id: string; name: string }[];
}

export interface Catalog {
  user: { name: string; role: 'admin' | 'distributor'; tier: string };
  settings: { ordersWhatsApp: string };
  products: Product[];
}

// --- Admin page (records as stored)

export interface AdminProduct {
  id: string;
  kind: Kind;
  name: string;
  description?: string;
  scent?: string;
  size?: string;
  priceStandard: number;
  pricePreferred: number;
  stock?: number;
  status: 'active' | 'archived';
  sort?: number;
  photo?: string;
  outOfStockSince?: string;
  listed?: boolean; // false when archived, or 60+ days out of stock
}

export interface AdminUser {
  email: string;
  name: string;
  role: 'admin' | 'distributor';
  tier: 'preferred' | 'standard';
  status: 'active' | 'removed';
}

/** "120.50" or "120" -> 12050 cents; null if not a valid amount. */
export function toCents(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
