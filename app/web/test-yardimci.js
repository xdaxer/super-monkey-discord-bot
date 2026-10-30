/**
 * Web API testleri için: bellek içi veritabanıyla gerçek HTTP sunucusu (rastgele
 * port), sahte Discord istemcisi ve hazır oturum. Discord'a istek atılmaz.
 *
 *   const s = await testSunucusu();
 *   const { durum, veri } = await s.istek('POST', '/api/gunluk');
 *   await s.kapat();
 */

import { createServer } from 'node:http';

import { sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { oturumDeposu } from './oturum.js';
import { tumRotalar } from './rotalar/index.js';
import { istekIsleyicisi } from './sunucu.js';

export const TEST_GUILD = 'g-test';
export const TEST_KULLANICI = '100000000000000001';
export const TEST_DIGER = '100000000000000002';

/** Rol eklemeyi kaydeden sahte üye. */
export function sahteUye(id, ad = `Üye${id.slice(-2)}`, { yonetici = false } = {}) {
  const roller = new Map();
  const uye = {
    id,
    // discord.js PermissionsBitField.has yerine: yalnız Yönetici sorulur.
    permissions: { has: () => yonetici },
    displayName: ad,
    user: { id, username: ad, bot: false },
    eklenenRoller: [],
    roles: {
      cache: roller,
      highest: { position: 1 },
      async add(rol) {
        const rolId = typeof rol === 'string' ? rol : rol.id;
        roller.set(rolId, { id: rolId });
        uye.eklenenRoller.push(rolId);
        return uye;
      },
    },
    displayAvatarURL: () => 'https://example.invalid/a.webp',
  };
  return uye;
}

export function sahteIstemci(uyeler = [sahteUye(TEST_KULLANICI, 'Test'), sahteUye(TEST_DIGER, 'Diger')]) {
  const cache = new Map(uyeler.map((u) => [u.id, u]));
  const guild = {
    id: TEST_GUILD,
    name: 'Test Sunucu',
    emojis: { cache: { find: () => undefined } },
    roles: { cache: new Map(), fetch: async () => null },
    members: {
      cache,
      me: { roles: { highest: { position: 100 } } },
      fetch: async (id) => {
        const u = cache.get(String(id));
        if (!u) throw new Error('Unknown Member');
        return u;
      },
      search: async ({ query }) => new Map([...cache].filter(([, u]) => u.displayName.toLowerCase().includes(String(query).toLowerCase()))),
    },
  };
  // rozetRoluVer gibi yardımcılar rolü uye.guild üzerinden arar.
  for (const u of uyeler) u.guild = guild;
  return { guilds: { cache: new Map([[TEST_GUILD, guild]]) }, guild };
}

export async function testSunucusu({ db = acVeritabani(':memory:'), ekonomiAcik = true, istemci = sahteIstemci() } = {}) {
  if (ekonomiAcik) sistemAyarla(db, TEST_GUILD, 'ekonomi', true);
  const oturumlar = oturumDeposu();
  const oturum = oturumlar.olustur(TEST_KULLANICI);
  const digerOturum = oturumlar.olustur(TEST_DIGER);
  const sunucu = createServer(istekIsleyicisi({
    db, client: istemci, guildId: TEST_GUILD, oturumlar, rotalar: tumRotalar, logger: { error() {}, log() {} },
  }));
  await new Promise((coz) => { sunucu.listen(0, '127.0.0.1', coz); });
  const { port } = sunucu.address();

  async function istek(yontem, yol, govde = undefined, { belirtec = oturum } = {}) {
    const yanit = await fetch(`http://127.0.0.1:${port}${yol}`, {
      method: yontem,
      headers: { 'Content-Type': 'application/json', ...(belirtec ? { Authorization: `Bearer ${belirtec}` } : {}) },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    });
    const tur = yanit.headers.get('content-type') ?? '';
    return { durum: yanit.status, veri: tur.includes('json') ? await yanit.json() : await yanit.arrayBuffer() };
  }

  return {
    db,
    istemci,
    oturum,
    digerOturum,
    istek,
    /** Diğer kullanıcı (TEST_DIGER) olarak istek. */
    digerIstek: (yontem, yol, govde) => istek(yontem, yol, govde, { belirtec: digerOturum }),
    kapat: () => new Promise((coz) => { sunucu.close(() => coz()); }),
  };
}
