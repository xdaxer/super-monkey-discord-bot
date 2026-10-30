/**
 * /calis olayları: her çalışmada küçük bir ihtimalle (OLAY_SANSI + maymunun
 * Şans yolu) bir olay çıkar. Anlık olaylar hemen uygulanır; seçimli olaylar
 * (MOAB, Altın Balon) iki düğmeyle gelir ve OLAY_SURE_MS içinde seçilmezse
 * kaçar. Kişi başı en çok bir bekleyen seçim olur; o sürerken yalnız anlık
 * olay çıkar.
 *
 * Olay muzu, olayın çıktığı çalışmanın kazancının katıdır (çarpanlar dahil);
 * defterde `calis` türüyle, karşı kimlik `olay-<kimlik>` olarak yazılır.
 * Sayılar docs/para.md "Çalışma olayları" bölümüyle birebir aynıdır.
 */

import { ekle, islem, TURLER } from './ekonomi.js';
import { enerjiEkle, enerjiOku } from './enerji.js';
import { kasaVer } from './kasalar.js';
import { borcaKes } from './kredi.js';
import { seviyeHesapla, xpVer } from './maymun.js';

export const OLAY_SANSI = 0.12;
export const OLAY_SURE_MS = 120_000;
export const MOLA_ENERJI = 20;
export const ANTRENMAN_XP = 5;
export const MOAB_SANS = 0.4;
export const MOAB_KAT = 3;
export const ALTIN_SANS = 0.5;
export const ALTIN_KAT = 5;
export const ALTIN_ENERJI = 15;

export const OLAYLAR = Object.freeze([
  {
    kimlik: 'usta', agirlik: 25, ad: 'Usta Maymun', emoji: '⭐',
    metin: 'Usta bir maymun yardıma geldi: bu çalışmanın kazancı **iki katına** çıktı!',
  },
  {
    kimlik: 'mola', agirlik: 20, ad: 'Muz Molası', emoji: '🍌',
    metin: `Kısa bir muz molası verdin: **+${MOLA_ENERJI} enerji**.`,
  },
  {
    kimlik: 'antrenman', agirlik: 15, ad: 'Antrenman', emoji: '📚', maymunlu: true,
    metin: `Maymunun mesai sonrası antrenman yaptı: **+${ANTRENMAN_XP} XP**.`,
  },
  {
    kimlik: 'kasa', agirlik: 10, ad: 'Kayıp Kasa', emoji: '🎁',
    metin: 'Patlayan balonun içinden bir **Ahşap Kasa** düştü!',
  },
  {
    kimlik: 'moab', agirlik: 15, ad: 'Kaçak M.O.A.B.', emoji: '🎈', secimli: true,
    metin: `Yoldan kaçak bir **M.O.A.B.** geçiyor! Vurursan **%${MOAB_SANS * 100}** ihtimalle bu çalışmanın `
      + `**${MOAB_KAT} katını** kazanırsın; kenardan dürtersen garanti **1 katı**.`,
    secenekler: [
      { kimlik: 'vur', etiket: 'Vur!', emoji: '💥' },
      { kimlik: 'durt', etiket: 'Kenardan dürt', emoji: '🪃' },
    ],
  },
  {
    kimlik: 'altin', agirlik: 15, ad: 'Altın Balon', emoji: '✨', secimli: true,
    metin: `Bir **Altın Balon** belirdi! Kovalarsan **${ALTIN_ENERJI} enerji** harcarsın; **%${ALTIN_SANS * 100}** `
      + `ihtimalle yakalayıp bu çalışmanın **${ALTIN_KAT} katını** kazanırsın.`,
    secenekler: [
      { kimlik: 'kovala', etiket: 'Kovala', emoji: '🏃' },
      { kimlik: 'birak', etiket: 'Bırak gitsin', emoji: '👋' },
    ],
  },
]);

const HARITA = new Map(OLAYLAR.map((o) => [o.kimlik, o]));

export function olayGetir(kimlik) {
  return HARITA.get(kimlik) ?? null;
}

/**
 * Olay zarı: önce `sans` ihtimaliyle olay çıkıp çıkmadığı, sonra ağırlıkla
 * hangisi. Maymunsuz çalışana antrenman, bekleyen seçimi olana seçimli olay çıkmaz.
 */
export function olayZari(rastgele = Math.random, { sans = OLAY_SANSI, maymunVar = false, secimliOlur = true } = {}) {
  if (rastgele() >= sans) return null;
  const uygun = OLAYLAR.filter((o) => (!o.maymunlu || maymunVar) && (!o.secimli || secimliOlur));
  const toplam = uygun.reduce((t, o) => t + o.agirlik, 0);
  let zar = rastgele() * toplam;
  for (const o of uygun) {
    zar -= o.agirlik;
    if (zar < 0) return o;
  }
  return uygun.at(-1);
}

/** Bekleyen seçimli olay; süresi geçmişse silinir ve null döner. */
export function bekleyenOlay(db, guildId, kullaniciId, simdi = Date.now()) {
  const satir = db
    .prepare('SELECT olay, kazanc, bitis FROM calis_olaylari WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  if (!satir) return null;
  if (satir.bitis <= simdi) {
    db.prepare('DELETE FROM calis_olaylari WHERE guild_id = ? AND kullanici_id = ?').run(String(guildId), String(kullaniciId));
    return null;
  }
  return { olay: olayGetir(satir.olay), kazanc: satir.kazanc, bitis: satir.bitis };
}

function olayMuzu(db, {
  guildId, kullaniciId, miktar, olay, simdi,
}) {
  if (miktar <= 0) return 0;
  ekle(db, {
    guildId, kullaniciId, miktar, tur: TURLER.calis, karsiId: `olay-${olay}`, simdi,
  });
  borcaKes(db, guildId, kullaniciId, miktar, simdi); // borçluysa gelirin payı borca gider
  return miktar;
}

/**
 * Çıkan olayı uygular (calis işleminin içinden çağrılır). Seçimli olay
 * bekleyen olarak yazılır.
 * @returns {{kimlik, ad, emoji, metin, muz?: number, enerji?: number, xp?: object, kasa?: string,
 *   secenekler?: object[], bitis?: number}}
 */
export function olayUygula(db, {
  guildId, kullaniciId, olay, kazanc, maymunKart, simdi = Date.now(),
}) {
  const sonuc = {
    kimlik: olay.kimlik, ad: olay.ad, emoji: olay.emoji, metin: olay.metin,
  };
  const ortak = { guildId, kullaniciId, olay: olay.kimlik, simdi };
  switch (olay.kimlik) {
    case 'usta':
      sonuc.muz = olayMuzu(db, { ...ortak, miktar: kazanc });
      break;
    case 'mola':
      sonuc.enerji = enerjiEkle(db, guildId, kullaniciId, MOLA_ENERJI, simdi);
      break;
    case 'antrenman':
      sonuc.xp = seviyeHesapla(xpVer(db, guildId, kullaniciId, maymunKart, ANTRENMAN_XP));
      break;
    case 'kasa':
      kasaVer(db, {
        guildId, kullaniciId, kasa: 'kasa-ahsap', tur: 'calis', simdi,
      });
      sonuc.kasa = 'kasa-ahsap';
      break;
    default: {
      const bitis = simdi + OLAY_SURE_MS;
      db.prepare(
        `INSERT INTO calis_olaylari (guild_id, kullanici_id, olay, kazanc, bitis) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET olay = excluded.olay, kazanc = excluded.kazanc, bitis = excluded.bitis`,
      ).run(String(guildId), String(kullaniciId), olay.kimlik, kazanc, bitis);
      sonuc.secenekler = olay.secenekler;
      sonuc.bitis = bitis;
    }
  }
  return sonuc;
}

/**
 * Bekleyen seçimli olayı çözer.
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, olay: object, secim: string, basarili: boolean, muz: number, enerji: number, metin: string}}
 */
export function olayCoz(db, {
  guildId, kullaniciId, secim, simdi = Date.now(), rastgele = Math.random,
}) {
  return islem(db, () => {
    const bekleyen = bekleyenOlay(db, guildId, kullaniciId, simdi);
    if (!bekleyen) return { ok: false, kacti: true, sebep: 'Bu olay kaçtı ya da çoktan çözüldü. Çalışmaya devam!' };
    const { olay, kazanc } = bekleyen;
    if (!olay.secenekler.some((s) => s.kimlik === secim)) return { ok: false, sebep: 'Geçersiz seçim.' };

    let muz = 0;
    let basarili = false;
    let metin;
    const ortak = { guildId, kullaniciId, olay: olay.kimlik, simdi };
    if (secim === 'vur') {
      basarili = rastgele() < MOAB_SANS;
      if (basarili) muz = olayMuzu(db, { ...ortak, miktar: kazanc * MOAB_KAT });
      metin = basarili ? '💥 Tam isabet! M.O.A.B. paramparça oldu.' : '💨 Iskaladın, M.O.A.B. bulutların arasında kayboldu.';
    } else if (secim === 'durt') {
      basarili = true;
      muz = olayMuzu(db, { ...ortak, miktar: kazanc });
      metin = '🪃 Kenardan dürttün, düşen muzları topladın.';
    } else if (secim === 'kovala') {
      if (enerjiOku(db, guildId, kullaniciId, simdi) < ALTIN_ENERJI) {
        return { ok: false, sebep: `Kovalamak için en az **${ALTIN_ENERJI} enerji** gerekiyor.` };
      }
      enerjiEkle(db, guildId, kullaniciId, -ALTIN_ENERJI, simdi);
      basarili = rastgele() < ALTIN_SANS;
      if (basarili) muz = olayMuzu(db, { ...ortak, miktar: kazanc * ALTIN_KAT });
      metin = basarili ? '✨ Yakaladın! Altın Balon şıngırdayarak patladı.' : '😮‍💨 Altın Balon son anda elinden kaçtı.';
    } else {
      metin = '👋 Altın Balonun uzaklaşmasını izledin.';
    }

    db.prepare('DELETE FROM calis_olaylari WHERE guild_id = ? AND kullanici_id = ?').run(String(guildId), String(kullaniciId));
    return {
      ok: true, olay, secim, basarili, muz, enerji: enerjiOku(db, guildId, kullaniciId, simdi), metin,
    };
  });
}
