/**
 * Bütün ekranların ortak kullandığı sabit katalog: para simgesi, nadirlikler,
 * kartlar ve eşyalar (görselleriyle), sunucunun BTD emojileri. Ön yüz açılışta
 * bir kez çeker.
 */

import { KARTLAR, KASA_KIMLIKLERI, kartDegeri, kartGetir, NADIRLIK_SIRASI, NADIRLIKLER, parlakKimlik } from '../../lib/kasalar.js';
import { nabizKaydet } from '../../lib/arayuz-sure.js';
import { ESYALAR } from '../../lib/esyalar.js';
import { webdenTalepAc } from '../../lib/talep-bilesen.js';
import { basarili } from '../yardimci.js';
import { emojiYolu, paraGorseli, uyeOzeti } from '../gorsel.js';

const renk = (sayi) => `#${sayi.toString(16).padStart(6, '0')}`;

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/katalog',
    sistemsiz: true,
    calistir(b) {
      const kart = (k) => ({
        kimlik: k.kimlik, ad: k.ad, nadirlik: k.nadirlik, parlak: Boolean(k.parlak), deger: kartDegeri(k), gorsel: b.gorsel(k),
      });
      return {
        para: paraGorseli(),
        nadirlikler: NADIRLIK_SIRASI.map((n) => ({
          kimlik: n, ad: NADIRLIKLER[n].ad, simge: NADIRLIKLER[n].simge, renk: renk(NADIRLIKLER[n].renk), deger: NADIRLIKLER[n].deger,
        })),
        // Normal kartlar ve parlak sürümleri (kimlik → nesne olarak kullanılsın diye düz liste).
        kartlar: KARTLAR.flatMap((k) => [kart(k), kart(kartGetir(parlakKimlik(k.kimlik)))]),
        esyalar: ESYALAR.map((e) => ({
          kimlik: e.kimlik, ad: e.ad, kategori: e.kategori, tur: e.tur, fiyat: e.fiyat, aciklama: e.aciklama, gorsel: b.gorsel(e),
        })),
        kasalar: KASA_KIMLIKLERI,
        // Sunucudaki BTD emojileri (ad → görsel yolu): arayüz metindeki emojiyi,
        // karşılığı varsa ikon yerine bu BTD resmiyle çizer (activity/src/lib/emoji.jsx).
        btd: Object.fromEntries([...(b.guild?.emojis?.cache?.values?.() ?? [])]
          .filter((e) => e.name?.startsWith('btd_'))
          .map((e) => [e.name, emojiYolu(e.id, e.animated)])),
      };
    },
  },
  {
    // Activity'den destek talebi (ekonomiden uzaklaştırma penceresi). Ekonomi
    // dışı olduğu için uzaklaştırılmış üyeye de açık (`sistemsiz`).
    yontem: 'POST',
    yol: '/api/talep/ac',
    sistemsiz: true,
    async calistir(b) {
      const uye = await b.uye();
      const sonuc = basarili(await webdenTalepAc(b.db, { guild: b.guild, user: uye?.user }));
      return {
        kanalId: sonuc.kanalId, id: sonuc.id, mevcut: sonuc.mevcut, guildId: b.guildId,
      };
    },
  },
];

/** Üye arama (gönder, hediye, düello, takas seçicisi). */
rotalar.push({
  yontem: 'GET',
  yol: '/api/uyeler',
  sistemsiz: true,
  async calistir(b) {
    const q = String(b.sorgu.get('q') ?? '').trim().slice(0, 32);
    if (!b.guild || q.length === 0) return { uyeler: [] };
    const bulunan = await b.guild.members.search({ query: q, limit: 10 }).catch(() => new Map());
    return {
      uyeler: [...bulunan.values()]
        .filter((u) => !u.user?.bot && u.id !== b.kullaniciId)
        .map((u) => uyeOzeti(b.guild, u.id)),
    };
  },
});

/** Arayüz nabzı: açık ve kullanılan Activity'nin süresi (lib/arayuz-sure.js; yalnız yönetici görür). */
rotalar.push({
  // { ekran: "ana" }
  yontem: 'POST',
  yol: '/api/nabiz',
  sistemsiz: true,
  calistir(b) {
    nabizKaydet(b.db, {
      guildId: b.guildId, kullaniciId: b.kullaniciId, ekran: typeof b.govde.ekran === 'string' ? b.govde.ekran : null,
    });
    return {};
  },
});
