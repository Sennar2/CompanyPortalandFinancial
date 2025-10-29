// lib/planday.ts
const TOKEN_URL = 'https://id.planday.com/connect/token';
const API_BASE = 'https://openapi.planday.com';

type TokenCache = { accessToken: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

async function fetchAccessToken(): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.PLANDAY_CLIENT_ID!;
  const refreshToken = process.env.PLANDAY_REFRESH_TOKEN!;
  if (!clientId || !refreshToken) throw new Error('Missing PLANDAY_CLIENT_ID or PLANDAY_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Planday token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 30 > now) return tokenCache.accessToken;
  const { access_token, expires_in } = await fetchAccessToken();
  tokenCache = { accessToken: access_token, expiresAt: now + Math.max(60, Math.min(expires_in, 3600)) };
  return tokenCache.accessToken;
}

export async function plandayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'X-ClientId': process.env.PLANDAY_CLIENT_ID!,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Planday API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
