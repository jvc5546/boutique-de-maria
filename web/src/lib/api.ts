// Calls to the site's API (/api/*), with the signed-in person's ID token.
// API Gateway rejects missing or invalid tokens; the API itself answers 401
// "no-invitado" for people who were removed from the list.

import { clearSession, getIdToken } from './auth';

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`API error ${status}`);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  if (!token) return leave('/');

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    clearSession();
    return leave(body.error === 'no-invitado' ? '/?motivo=no-invitado' : '/');
  }
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

function leave(to: string): Promise<never> {
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
  price: number; // cents, MXN
  prices?: { standard: number; preferred: number }; // admins only
  availability: 'in' | 'low' | 'out';
  stock: number;
  components: { id: string; name: string }[];
  related: { id: string; name: string }[];
}

export interface Catalog {
  user: { name: string; role: 'admin' | 'distributor'; tier: string };
  products: Product[];
}

export function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
