/**
 * Activity girişi: Embedded App SDK'nın `authorize` ile verdiği kodu
 * uygulama sırrıyla erişim belirtecine çevirir, kullanıcıyı Discord'dan
 * öğrenir ve kendi kısa ömürlü oturum belirtecimizi verir.
 *
 * Oturumlar bellekte tutulur: bot yeniden başlarsa düşer, Activity sessizce
 * yeniden giriş yapar (prompt: none). Discord erişim belirteci saklanmaz.
 */

import { randomBytes } from 'node:crypto';

const DISCORD_API = 'https://discord.com/api/v10';
export const OTURUM_SURE_MS = 12 * 3_600_000;

/** Bellek içi oturum deposu. */
export function oturumDeposu({ sureMs = OTURUM_SURE_MS } = {}) {
  const oturumlar = new Map();

  return {
    olustur(kullaniciId, simdi = Date.now()) {
      // Eskileri arada bir süpür; Map sonsuza büyümesin.
      if (oturumlar.size > 1000) {
        for (const [t, o] of oturumlar) if (o.bitis <= simdi) oturumlar.delete(t);
      }
      const belirtec = randomBytes(32).toString('base64url');
      oturumlar.set(belirtec, { kullaniciId: String(kullaniciId), bitis: simdi + sureMs });
      return belirtec;
    },
    /** @returns {string|null} oturumun kullanıcı kimliği */
    dogrula(belirtec, simdi = Date.now()) {
      const o = typeof belirtec === 'string' ? oturumlar.get(belirtec) : null;
      if (!o) return null;
      if (o.bitis <= simdi) {
        oturumlar.delete(belirtec);
        return null;
      }
      return o.kullaniciId;
    },
  };
}

/** Yetkilendirme kodunu erişim belirtecine çevirir. */
export async function kodDegistir(kod, { clientId, clientSecret, fetchFn = fetch }) {
  const yanit = await fetchFn(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: kod,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) return null;
  const veri = await yanit.json();
  return typeof veri?.access_token === 'string' ? veri.access_token : null;
}

/** Erişim belirtecinin sahibi. */
export async function kullaniciGetir(erisim, { fetchFn = fetch } = {}) {
  const yanit = await fetchFn(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${erisim}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) return null;
  const veri = await yanit.json();
  return veri?.id ? veri : null;
}
