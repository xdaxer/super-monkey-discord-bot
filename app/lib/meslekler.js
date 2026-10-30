/**
 * /calis: ana emek geliri. OwO hunt gibi 15 sn beklemeli kısa iş; günlük tavanı
 * enerji koyar: her çalışma enerjiden yorgunluk düşer, enerji zamanla dolar.
 * Kilitli maymunun direnci (maymun.js, OwO formülü) ve Dayanıklılık yolu
 * yorgunluğu azaltır; Kazanç yolu muzu, Şans yolu olay ve kasa şansını artırır.
 * Çalışmada küçük ihtimalle olay çıkar (calis-olay.js). Meslekler seviyeyle açılır, kazanç mesleğin aralığında rastgeledir; küçük
 * ihtimalle bonus kasa düşer. Rozetler kazanca kalıcı yüzde ekler.
 *
 * Sayılar docs/para.md "Çalışma ve meslekler" bölümüyle birebir aynıdır; biri
 * değişirse diğeri de değişmeli. Muz yalnız ekonomi.js `ekle` ile yazılır
 * (defter türü `calis`); `muz-2x` etkinliği kazancı 2 katlar (bonus kasa değişmez).
 */

import { bekleyenOlay, OLAY_SANSI, olayUygula, olayZari } from './calis-olay.js';
import {
  bakiye, ekle, islem, TURLER,
} from './ekonomi.js';
import {
  ENERJI_DOLUM_MS, ENERJI_MAKS, enerjiHesapla, enerjiOku, enerjiYaz,
} from './enerji.js';
import { etkinlikCarpani } from './etkinlik.js';
import { rozetCalisBonusu } from './esyalar.js';
import { kasaVer } from './kasalar.js';
import { borcaKes } from './kredi.js';
import { calisanMaymun, seviyeHesapla, xpVer } from './maymun.js';
import { carpanUygula, prestijCarpani } from './prestij-carpan.js';
import { kullaniciGetir } from './seviye.js';
import { uyelikCarpani } from './uyelik-carpan.js';
import { yoneticiCarpani } from './yonetici-carpan.js';

/** Kişi başı bekleme: 15 sn (OwO hunt ile aynı). */
export const BEKLEME_MS = 15_000;

/**
 * Enerji (enerji.js): en çok 100, 36 sn'de 1 dolar (boştan 1 saatte dolu).
 * Her çalışma YORGUNLUK × (1 − direnç) × (1 − Dayanıklılık) enerji harcar:
 * maymunsuz ~12, iyi maymunla ~20+ çalışma bir doluluk.
 */
export { ENERJI_DOLUM_MS, ENERJI_MAKS, enerjiHesapla };
export const YORGUNLUK = 10;

/** Bonus kasa olasılıkları (yüzde, çalışma başına); tek zarla: önce Demir, sonra Ahşap aralığı. */
export const BONUS_DEMIR = 0.05;
export const BONUS_AHSAP = 0.4;

/** Seçimi "otomatik"e döndüren değer: en yüksek açık meslek. */
export const OTOMATIK = 'otomatik';

/**
 * Seviye eşikleri seviye rolleriyle (seviye-rol.js KADEMELER) uyumludur.
 * `emojiAdi`: sunucudaki BTD emojisi (yoksa `yedek`). Olay metinlerinde `{n}`
 * 2-60 arası rastgele bir sayıyla değişir (yalnız süs, kazancı etkilemez).
 */
export const MESLEKLER = Object.freeze([
  {
    kimlik: 'dart', ad: 'Dart Maymunu', seviye: 0, min: 16, max: 24, emojiAdi: 'btd_dart_monkey', yedek: '🎯',
    olaylar: [
      'Dart Maymunu olarak {n} kırmızı balon patlattın.',
      'Dart Maymunu olarak nöbet tuttun; {n} mavi balon dart yedi.',
      'Üç yönlü dart atışını denedin, {n} balon bir seferde patladı.',
      'Dart Maymunu olarak sabaha kadar yola baktın; {n} sarı balon geçemedi.',
      'Dartların bitince elinle {n} balon patlattın, kimse görmedi.',
    ],
  },
  {
    kimlik: 'bumerang', ad: 'Bumerang Maymunu', seviye: 3, min: 20, max: 30, emojiAdi: 'btd_boomerang', yedek: '🪃',
    olaylar: [
      'Bumerangını fırlattın, geri dönerken {n} balonu daha patlattı.',
      'Bumerang Maymunu olarak yeri doğru ayarladın: {n} balon tek turda gitti.',
      'Bumerang eve dönmedi, ama yolda {n} balon topladı.',
      'Yakaladığın bumerangla {n} yeşil balonu birden patlattın.',
      'Bumerang Maymunu olarak durmadan fırlatıp yakaladın, kolun tutuldu ama {n} balon patladı.',
    ],
  },
  {
    kimlik: 'bomba', ad: 'Bomba Atıcı', seviye: 5, min: 26, max: 38, emojiAdi: 'btd_bomb_shooter', yedek: '💣',
    olaylar: [
      'Bomba Atıcı olarak tek mermiyle {n} balonu havaya uçurdun.',
      'Bombanın yan etkisi: {n} balon ve yarım ağaç gitti.',
      'Bomba Atıcı olarak kalabalığa nişan aldın, {n} balon patladı.',
      'Seri bomba atışında {n} seramik balonun kabuğunu çatlattın.',
      'Fitili kısa tuttun; {n} balon dumanlar içinde kayboldu.',
    ],
  },
  {
    kimlik: 'ninja', ad: 'Ninja Maymun', seviye: 10, min: 34, max: 50, emojiAdi: 'btd_ninja', yedek: '🥷',
    olaylar: [
      'Ninja Maymun olarak gölgelerden çıkıp {n} kamuflaj balonu avladın.',
      'Shuriken yağmuruyla {n} balonu kimse görmeden patlattın.',
      'Ninja Maymun olarak sessizce çalıştın; {n} balon neye uğradığını anlamadı.',
      'Duman bombası attın, dumanın içinde {n} balon yok oldu.',
      'Çatıdan çatıya atladın, {n} balon peşinden gelip patladı.',
    ],
  },
  {
    kimlik: 'buyucu', ad: 'Büyücü Maymun', seviye: 15, min: 44, max: 64, emojiAdi: 'btd_wizard', yedek: '🧙',
    olaylar: [
      'Büyücü Maymun olarak ateş topu fırlattın, {n} balon küle döndü.',
      'Büyü kitabını yanlış sayfadan açtın ama yine de {n} balon patladı.',
      'Büyücü Maymun olarak {n} balonu kurbağaya çevirmeye çalıştın; en azından patladılar.',
      'Şimşek büyüsüyle zincirleme {n} balonu çarptın.',
      'Asanı salladın, {n} balon havada asılı kalıp sonra patladı.',
    ],
  },
  {
    kimlik: 'medyum', ad: 'Medyum Maymun', seviye: 25, min: 56, max: 80, emojiAdi: 'btd_psi', yedek: '🔮',
    olaylar: [
      'Medyum Maymun olarak zihninle {n} balonu dokunmadan patlattın.',
      'Kristal küreye baktın: sıradaki {n} balonun yolunu önceden bildin.',
      'Medyum Maymun olarak kaşını kaldırdın, {n} balon kendiliğinden patladı.',
      'Üçüncü gözün açıldı; {n} gizli balon artık gizli değil.',
      'Odaklandın, {n} balon aynı anda ürperip patladı.',
    ],
  },
  {
    kimlik: 'simyaci', ad: 'Simyacı Maymun', seviye: 40, min: 70, max: 100, emojiAdi: 'btd_alchemist', yedek: '⚗️',
    olaylar: [
      'Simyacı Maymun olarak karışımını attın, {n} balon köpürüp patladı.',
      'Kurşunu altına çevirdin; {n} kurşun balon da altın değerinde patladı.',
      'Simyacı Maymun olarak iksirini kule dostlarına ikram ettin, {n} balon bedavaya patladı.',
      'Deney ters tepti ama {n} balon asit yağmuruna yakalandı.',
      'Laboratuvarda gece mesaisi yaptın; sabaha {n} balonluk iksir çıktı.',
    ],
  },
  {
    kimlik: 'super', ad: 'Süper Maymun', seviye: 50, min: 84, max: 120, emojiAdi: 'btd_super_monkey', yedek: '🦸',
    olaylar: [
      'Süper Maymun olarak pelerinini savurdun, {n} balon rüzgardan patladı.',
      'Süper Maymun olarak lazer gözlerinle {n} balonu eritti.',
      'Işık hızında dart yağdırdın: {n} balon saniyesinde gitti.',
      'Süper Maymun olarak uçarak {n} balonun yolunu kesip savuşturdun.',
      'Kahramanlık mesaisi: {n} balon, tek bir nefeste.',
    ],
  },
]);

const HARITA = new Map(MESLEKLER.map((m) => [m.kimlik, m]));

export function meslekGetir(kimlik) {
  return HARITA.get(kimlik) ?? null;
}

/** Seviyede açık meslekler (kilit seviyesine göre artan). */
export function acikMeslekler(seviye) {
  return MESLEKLER.filter((m) => m.seviye <= seviye);
}

/** Seviyedeki en yüksek açık meslek. */
export function enYuksekMeslek(seviye) {
  return acikMeslekler(seviye).at(-1) ?? MESLEKLER[0];
}

/** Sonraki kilitli meslek; hepsi açıksa null. */
export function sonrakiMeslek(seviye) {
  return MESLEKLER.find((m) => m.seviye > seviye) ?? null;
}

function aralik(min, max, rastgele) {
  return min + Math.floor(rastgele() * (max - min + 1));
}

/** Kayıtlı seçim geçerli ve açıksa onu, değilse en yüksek açık mesleği döner. */
export function gecerliMeslek(seviye, secim) {
  const secilen = secim && secim !== OTOMATIK ? meslekGetir(secim) : null;
  return secilen && secilen.seviye <= seviye ? secilen : enYuksekMeslek(seviye);
}

export function calismaGetir(db, guildId, kullaniciId) {
  const satir = db
    .prepare('SELECT son_calisma, meslek, enerji, enerji_zaman FROM calismalar WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return satir ?? {
    son_calisma: 0, meslek: null, enerji: 0, enerji_zaman: 0,
  };
}

/** Kalan bekleme (ms); 0 = çalışabilir. */
export function kalanBekleme(db, guildId, kullaniciId, simdi = Date.now()) {
  const { son_calisma: son } = calismaGetir(db, guildId, kullaniciId);
  return son > 0 ? Math.max(0, son + BEKLEME_MS - simdi) : 0;
}

/** Direnci (ve Dayanıklılık indirimi) verilen bir çalışmanın enerji bedeli. */
export function yorgunluk(direnc, indirim = 0) {
  return YORGUNLUK * (1 - direnc) * (1 - indirim);
}

/**
 * Çalışma durumu (yazmadan): enerji, kilitli maymun, bir çalışmanın bedeli,
 * bekleme ve enerji yetmiyorsa dolmasına kalan süre.
 */
export function calismaDurumu(db, guildId, kullaniciId, simdi = Date.now()) {
  const satir = calismaGetir(db, guildId, kullaniciId);
  const enerji = enerjiHesapla(satir, simdi);
  const maymun = calisanMaymun(db, guildId, kullaniciId);
  const bedel = yorgunluk(maymun.direnc, maymun.etki.enerji);
  return {
    enerji,
    enerjiMaks: ENERJI_MAKS,
    maymun,
    bedel,
    beklemeMs: satir.son_calisma > 0 ? Math.max(0, satir.son_calisma + BEKLEME_MS - simdi) : 0,
    enerjiMs: enerji >= bedel ? 0 : Math.ceil((bedel - enerji) * ENERJI_DOLUM_MS),
    tamDolumMs: Math.ceil((ENERJI_MAKS - enerji) * ENERJI_DOLUM_MS),
    rozetBonus: rozetCalisBonusu(db, guildId, kullaniciId),
    olaySansi: OLAY_SANSI + maymun.etki.olay,
    bekleyenOlay: bekleyenOlay(db, guildId, kullaniciId, simdi),
  };
}

/**
 * Meslek seçer. `kimlik` = OTOMATIK ise seçimi kaldırır.
 * @returns {{ok: false, sebep: string} | {ok: true, meslek: object, otomatik: boolean}}
 */
export function meslekSec(db, { guildId, kullaniciId, kimlik }) {
  const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
  const otomatik = kimlik === OTOMATIK;
  const meslek = otomatik ? enYuksekMeslek(seviye) : meslekGetir(kimlik);
  if (!meslek) return { ok: false, sebep: 'Böyle bir meslek yok.' };
  if (meslek.seviye > seviye) {
    return { ok: false, sebep: `**${meslek.ad}** Sv ${meslek.seviye} gerektirir; sen Sv ${seviye}'sin.` };
  }
  db.prepare(
    `INSERT INTO calismalar (guild_id, kullanici_id, meslek) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET meslek = excluded.meslek`,
  ).run(String(guildId), String(kullaniciId), otomatik ? null : meslek.kimlik);
  return { ok: true, meslek, otomatik };
}

/**
 * Bonus kasa zarı: tek sayıyla Demir (%0,05) ya da Ahşap (%0,4); yoksa null.
 * `carpan`: Şans yolunun kasa çarpanı.
 */
export function bonusKasa(rastgele = Math.random, carpan = 1) {
  const yuzde = rastgele() * 100;
  if (yuzde < BONUS_DEMIR * carpan) return 'kasa-demir';
  if (yuzde < (BONUS_DEMIR + BONUS_AHSAP) * carpan) return 'kasa-ahsap';
  return null;
}

/**
 * Çalışır. Bekleme dolmadıysa ya da enerji yetmiyorsa hiçbir şey yazmaz.
 * @returns {{ok: false, yorgun: boolean, kalanMs: number, durum: object}
 *   | {ok: true, meslek: object, olay: string, taban: number, kazanc: number, etkinlik: boolean, kasa: string|null,
 *      bakiye: number, kalanMs: number, enerji: number, bedel: number, maymun: object|null, rozet: number,
 *      olayEtkisi: object|null}}  `olayEtkisi`: çıkan olay (calis-olay.js olayUygula)
 */
export function calis(db, {
  guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random,
}) {
  return islem(db, () => {
    const durum = calismaDurumu(db, guildId, kullaniciId, simdi);
    if (durum.beklemeMs > 0) return { ok: false, yorgun: false, kalanMs: durum.beklemeMs, durum };
    if (durum.enerjiMs > 0) return { ok: false, yorgun: true, kalanMs: durum.enerjiMs, durum };

    const { meslek: secim } = calismaGetir(db, guildId, kullaniciId);
    const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
    const meslek = gecerliMeslek(seviye, secim);

    const taban = aralik(meslek.min, meslek.max, rastgele);
    const { etki } = durum.maymun;
    const kasa = bonusKasa(rastgele, etki.kasa);
    const olay = meslek.olaylar[aralik(0, meslek.olaylar.length - 1, rastgele)]
      .replaceAll('{n}', () => String(aralik(2, 60, rastgele)));
    const carpan = etkinlikCarpani(db, guildId, 'muz-2x', simdi);
    const prestij = prestijCarpani(db, guildId, kullaniciId);
    const uyelik = uyelikCarpani(db, guildId, kullaniciId);
    const rozet = durum.rozetBonus;
    const kazanc = carpanUygula(
      taban * carpan,
      prestij * uyelik * yoneticiCarpani(kullaniciId) * (1 + rozet / 100) * (1 + etki.kazanc),
    );

    enerjiYaz(db, guildId, kullaniciId, durum.enerji - durum.bedel, simdi);
    db.prepare('UPDATE calismalar SET son_calisma = ? WHERE guild_id = ? AND kullanici_id = ?')
      .run(simdi, String(guildId), String(kullaniciId));
    ekle(db, {
      guildId, kullaniciId, miktar: kazanc, tur: TURLER.calis, simdi,
    });
    const borcKesilen = borcaKes(db, guildId, kullaniciId, kazanc, simdi); // borçluysa gelirin payı borca gider
    if (kasa) kasaVer(db, { guildId, kullaniciId, kasa, tur: 'calis', simdi });

    const cikan = olayZari(rastgele, {
      sans: durum.olaySansi, maymunVar: Boolean(durum.maymun.kart), secimliOlur: !durum.bekleyenOlay,
    });
    const olayEtkisi = cikan ? olayUygula(db, {
      guildId, kullaniciId, olay: cikan, kazanc, maymunKart: durum.maymun.kart?.kimlik, simdi,
    }) : null;

    let maymun = null;
    if (durum.maymun.kart) {
      const lvl = seviyeHesapla(xpVer(db, guildId, kullaniciId, durum.maymun.kart.kimlik));
      maymun = {
        ...durum.maymun, ...lvl, seviyeAtladi: lvl.seviye > durum.maymun.seviye,
      };
    }

    return {
      ok: true,
      meslek,
      olay,
      taban,
      kazanc,
      etkinlik: carpan > 1,
      prestij,
      uyelik,
      rozet,
      kasa,
      borcKesilen,
      bakiye: bakiye(db, guildId, kullaniciId),
      kalanMs: BEKLEME_MS,
      enerji: enerjiOku(db, guildId, kullaniciId, simdi),
      olayEtkisi,
      enerjiMaks: ENERJI_MAKS,
      bedel: durum.bedel,
      direnc: durum.maymun.direnc,
      maymun,
    };
  });
}
