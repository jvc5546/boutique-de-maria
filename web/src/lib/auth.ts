// Sign-in with Cognito + Google, from the browser, with no libraries.
//
// OAuth 2.0 authorization code flow with PKCE:
//   1. signIn(): make a random "verifier", send its SHA-256 ("challenge") to
//      Cognito, which sends the person to Google.
//   2. Google -> Cognito (auth-gate checks the invite list) -> /auth/callback?code=...
//   3. handleCallback(): swap the code + the original verifier for tokens.
//      Only the browser that started the sign-in knows the verifier, so a
//      stolen code is useless. No client secret ever reaches the browser.
//
// Tokens live in localStorage so people stay signed in on their phones.
// The ID token lasts 1 hour; it's refreshed quietly for 30 days.

export const AUTH_DOMAIN: string =
  import.meta.env.PUBLIC_AUTH_DOMAIN || 'auth.boutiquedemariamx.com';
const CLIENT_ID: string = import.meta.env.PUBLIC_AUTH_CLIENT_ID || '';

const SESSION_KEY = 'bdm.session';
const PKCE_KEY = 'bdm.pkce';
const NOT_INVITED = 'NO_INVITADO'; // message thrown by the auth-gate Lambda

export type Role = 'admin' | 'distributor';
export type Tier = 'preferred' | 'standard' | '';

export interface User {
  email: string;
  name: string;
  role: Role;
  tier: Tier;
}

interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
}

/** 'not-invited' = Google account isn't on the list; 'failed' = anything else. */
export class AuthError extends Error {
  reason: 'not-invited' | 'failed';
  constructor(reason: 'not-invited' | 'failed', detail = '') {
    super(detail || reason);
    this.reason = reason;
  }
}

export const isConfigured = () => CLIENT_ID !== '';

// ---------------------------------------------------------------- sign in

export async function signIn(returnTo = '/inicio'): Promise<void> {
  if (!isConfigured()) throw new AuthError('failed', 'PUBLIC_AUTH_CLIENT_ID is not set');
  const verifier = randomString(64);
  const state = randomString(32);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));

  const url = new URL(`https://${AUTH_DOMAIN}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    identity_provider: 'Google', // skip Cognito's page, go straight to Google
    state,
    code_challenge: base64url(await sha256(verifier)),
    code_challenge_method: 'S256',
  }).toString();
  location.assign(url.toString());
}

/** Finishes sign-in on /auth/callback. Returns where to go next. */
export async function handleCallback(): Promise<string> {
  const params = new URLSearchParams(location.search);
  const error = params.get('error_description') || params.get('error');
  if (error) throw toAuthError(error);

  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
  sessionStorage.removeItem(PKCE_KEY);
  const code = params.get('code');
  if (!saved || !code || saved.state !== params.get('state')) {
    throw new AuthError('failed', 'state mismatch or missing code');
  }

  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: saved.verifier,
  });
  saveSession(tokens, tokens.refresh_token);
  return saved.returnTo || '/inicio';
}

// ---------------------------------------------------------------- session

/** The signed-in user, refreshing tokens if needed. null = signed out. */
export async function getUser(): Promise<User | null> {
  let session = loadSession();
  if (!session) return null;

  if (Date.now() > session.expiresAt - 60_000) {
    try {
      const tokens = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      });
      session = saveSession(tokens, session.refreshToken);
    } catch (e) {
      clearSession();
      if (e instanceof AuthError && e.reason === 'not-invited') throw e;
      return null;
    }
  }
  return userFromIdToken(session.idToken);
}

/** For API calls in later milestones: Authorization: Bearer <token>. */
export async function getIdToken(): Promise<string | null> {
  return (await getUser()) ? loadSession()?.idToken ?? null : null;
}

export function signOut(): void {
  const session = loadSession();
  clearSession();
  if (session && isConfigured()) {
    // Invalidate the refresh token too; keepalive lets it finish during navigation.
    fetch(`https://${AUTH_DOMAIN}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: session.refreshToken, client_id: CLIENT_ID }),
      keepalive: true,
    }).catch(() => {});
  }
  const url = new URL(`https://${AUTH_DOMAIN}/logout`);
  url.search = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: `${location.origin}/` }).toString();
  location.assign(isConfigured() ? url.toString() : '/');
}

/** Use at the top of private pages: returns the user or sends them to sign in. */
export async function requireUser(): Promise<User> {
  try {
    const user = await getUser();
    if (user) return user;
    location.replace('/');
  } catch (e) {
    location.replace(e instanceof AuthError && e.reason === 'not-invited' ? '/?motivo=no-invitado' : '/');
  }
  return new Promise(() => {}); // never resolves: the page is navigating away
}

// ---------------------------------------------------------------- helpers

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`https://${AUTH_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw toAuthError(String(body.error_description || body.error || res.status));
  }
  return res.json();
}

function toAuthError(message: string): AuthError {
  return new AuthError(message.includes(NOT_INVITED) ? 'not-invited' : 'failed', message);
}

function saveSession(tokens: TokenResponse, refreshToken?: string): Session {
  const session: Session = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken || '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && s.idToken && s.refreshToken ? s : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// The token came straight from Cognito over HTTPS, so reading it is enough for
// showing the page. The API (later milestones) verifies signatures before
// trusting it with data.
function userFromIdToken(idToken: string): User {
  const claims = JSON.parse(base64urlDecode(idToken.split('.')[1]));
  return {
    email: claims.email ?? '',
    name: claims.bdm_name || claims.given_name || claims.name || '',
    role: claims.bdm_role === 'admin' ? 'admin' : 'distributor',
    tier: claims.bdm_tier === 'preferred' || claims.bdm_tier === 'standard' ? claims.bdm_tier : '',
  };
}

function redirectUri(): string {
  return `${location.origin}/auth/callback`;
}

function randomString(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
