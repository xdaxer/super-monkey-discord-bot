/**
 * Çalışan maymun: /calis'e envanterden bir maymun kartı (kule ya da kahraman)
 * kilitlenir; maymun çalıştıkça deneyim kazanır, seviyesi ve nadirliği
 * çalışma direncini belirler. Matematik OwO'nun savaş istatistikleridir
 * (Discord-OwO-Bot: battle/util/animalUtil.js `parseStats`, `getXP`;
 * battle/WeaponInterface.js `resToPercent`):
 *
 *   R       = 25 + 2 × seviye × oran      (OwO: pr = 25 + lvl × prr × 2)
 *   direnç  = 0,8 × R / (100 + R)          (maymunsuz %16; %80'e yaklaşır, geçmez)
 *   seviye  → bir sonrakine (seviye⁴ + 1.000) / 100 XP (OwO: lvl⁴ + 1000; burada
 *             çalışma başına 1 XP verildiği için 100'e bölündü)
 *
 * Oran nadirlikten gelir (OwO'da hayvan rütbesinin stat oranı gibi); parlak
 * kart +1 oran alır. Direnç her çalışmanın enerjiden düşen yorgunluğunu
 * azaltır (meslekler.js).
 *
 * Yükseltme yolları BTD6 kuleleri gibidir: üç yol (Kazanç, Dayanıklılık,
 * Şans), her biri 5 kademe; bir yol 5'e, ikinci yol en çok 2'ye çıkar, üçüncü
 * kapalı kalır (5-2-0). Her kademe muz ister ve maymunun seviyesine bağlıdır.
 * Yükseltmeler deneyim gibi kart kimliğine yazılır, prestijde korunur.
 *
 * Sayılar docs/para.md "Çalışma ve meslekler" bölümüyle birebir aynıdır.
 */

import {
  bakiye, dus, islem, TURLER,
} from './ekonomi.js';
import { adet, seferdekiler } from './envanter.js';
import { kartGetir } from './kasalar.js';

/** Maymun sayılan nadirlikler ve direnç oranları (efsanevi/mitik bosslar maymun değil). */
export const DIRENC_ORANLARI = Object.freeze({ siradan: 2, nadir: 3, destansi: 5 });
export const PARLAK_ORAN_EKI = 1;

/** Bu kartlar balon: kule/kahraman nadirliklerinde olsalar da çalışmaz. */
const BALONLAR = new Set(['kart-white', 'kart-purple', 'kart-zebra', 'kart-lead', 'kart-camo', 'kart-regrow', 'kart-fortified']);

/** OwO taban direnci ve tavanı. */
const R_TABAN = 25;
const DIRENC_TAVAN = 0.8;

/** Kart çalışabilen bir maymun mu (normal ya da parlak)? */
export function maymunMu(kimlik) {
  const kart = kartGetir(kimlik);
  if (!kart || !(kart.nadirlik in DIRENC_ORANLARI)) return false;
  return !BALONLAR.has(kart.temelKimlik ?? kart.kimlik);
}

/** Kartın direnç oranı; maymun değilse 0. */
export function direncOrani(kimlik) {
  if (!maymunMu(kimlik)) return 0;
  const kart = kartGetir(kimlik);
  return DIRENC_ORANLARI[kart.nadirlik] + (kart.parlak ? PARLAK_ORAN_EKI : 0);
}

/** OwO direnci: 0,8 × R / (100 + R), R = 25 + 2 × seviye × oran. */
export function direnc(seviye, oran) {
  const r = R_TABAN + 2 * seviye * oran;
  return (DIRENC_TAVAN * r) / (100 + r);
}

/** `seviye`den bir sonrakine gereken XP (OwO lvl⁴ + 1000, 100'e bölünmüş). */
export function seviyeXp(seviye) {
  return Math.floor((seviye ** 4 + 1000) / 100);
}

/** Toplam XP → { seviye, mevcut, gereken } (OwO toLvl; seviye 1'den başlar). */
export function seviyeHesapla(xp) {
  let seviye = 1;
  let kalan = Math.max(0, Math.floor(xp));
  while (kalan >= seviyeXp(seviye)) {
    kalan -= seviyeXp(seviye);
    seviye += 1;
  }
  return { seviye, mevcut: kalan, gereken: seviyeXp(seviye) };
}

// ── Yükseltme yolları ──────────────────────────────────────────────────────

/** Yollar ve kademe değerleri (1.–5. kademe; yüzde ya da yüzde puanı). */
export const YOLLAR = Object.freeze([
  { kimlik: 'kazanc', ad: 'Kazanç', emoji: '💰', degerler: [8, 16, 25, 35, 50] },
  { kimlik: 'dayaniklilik', ad: 'Dayanıklılık', emoji: '🛡️', degerler: [6, 12, 20, 28, 38] },
  { kimlik: 'sans', ad: 'Şans', emoji: '🍀', degerler: [3, 6, 9, 13, 18] },
]);

/** Şans yolunun kasa şansı çarpanı (kademe 0–5). */
export const SANS_KASA_CARPANI = Object.freeze([1, 1.5, 2, 3, 4, 5]);

/** Kademe n (1–5) için gereken maymun seviyesi ve muz bedeli. */
export const KADEMELER = Object.freeze([
  { seviye: 2, bedel: 1_500 },
  { seviye: 4, bedel: 4_000 },
  { seviye: 6, bedel: 10_000 },
  { seviye: 8, bedel: 25_000 },
  { seviye: 10, bedel: 60_000 },
]);

export const YOL_TAVANI = 5;
/** İkinci yolun çıkabileceği en yüksek kademe (BTD6 çapraz yol kuralı). */
export const IKINCI_YOL_TAVANI = 2;

/** "5-2-0" → [5, 2, 0]; bozuk değer [0, 0, 0]. */
export function yukseltmeAyristir(metin) {
  const parca = String(metin ?? '').split('-').map(Number);
  if (parca.length !== 3 || parca.some((n) => !Number.isInteger(n) || n < 0 || n > YOL_TAVANI)) return [0, 0, 0];
  return parca;
}

/** BTD6 kuralı: bir yol en çok 5, ikincisi en çok 2, üçüncüsü 0. */
export function yukseltmeGecerliMi(yollar) {
  const [a, b, c] = [...yollar].sort((x, y) => y - x);
  return a <= YOL_TAVANI && b <= IKINCI_YOL_TAVANI && c === 0;
}

/** Yolların toplam etkisi: oranlar 0–1 arası, `kasa` çarpan. */
export function yukseltmeEtkisi(yollar) {
  const deger = (i) => (yollar[i] > 0 ? YOLLAR[i].degerler[yollar[i] - 1] / 100 : 0);
  return {
    kazanc: deger(0), enerji: deger(1), sure: deger(1), olay: deger(2), kasa: SANS_KASA_CARPANI[yollar[2]],
  };
}

/**
 * Bir yolun sonraki kademesi ve önündeki engel: 'tavan' (5'te), 'capraz'
 * (BTD6 kuralı kapatıyor) ya da 'seviye' (maymun düşük); engel yoksa null.
 */
export function sonrakiYukseltme(yollar, yol, maymunSeviyesi) {
  const kademe = yollar[yol] + 1;
  if (kademe > YOL_TAVANI) return { kademe: null, engel: 'tavan' };
  const yeni = yollar.map((n, i) => (i === yol ? kademe : n));
  const gereken = KADEMELER[kademe - 1];
  let engel = null;
  if (!yukseltmeGecerliMi(yeni)) engel = 'capraz';
  else if (maymunSeviyesi < gereken.seviye) engel = 'seviye';
  return { kademe, ...gereken, engel };
}

/** Kademenin kullanıcıya anlatımı. */
export function yolAciklamasi(yol, kademe) {
  const d = YOLLAR[yol].degerler[kademe - 1];
  if (yol === 0) return `çalışma ve sefer muzu +%${d}`;
  if (yol === 1) return `%${d} daha az enerji, %${d} daha kısa sefer`;
  return `olay şansı +${d} puan, kasa şansı ×${SANS_KASA_CARPANI[kademe].toLocaleString('tr-TR')}`;
}

export function yukseltmeOku(db, guildId, kullaniciId, kart) {
  return yukseltmeAyristir(db
    .prepare('SELECT yukseltme FROM maymun_deneyim WHERE guild_id = ? AND kullanici_id = ? AND kart = ?')
    .get(String(guildId), String(kullaniciId), kart)?.yukseltme);
}

export function maymunXp(db, guildId, kullaniciId, kart) {
  return db
    .prepare('SELECT xp FROM maymun_deneyim WHERE guild_id = ? AND kullanici_id = ? AND kart = ?')
    .get(String(guildId), String(kullaniciId), kart)?.xp ?? 0;
}

/** Maymuna XP ekler; yeni toplamı döner. Çağıran işlem içinde olmalı. */
export function xpVer(db, guildId, kullaniciId, kart, miktar = 1) {
  db.prepare(
    `INSERT INTO maymun_deneyim (guild_id, kullanici_id, kart, xp) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id, kart) DO UPDATE SET xp = maymun_deneyim.xp + excluded.xp`,
  ).run(String(guildId), String(kullaniciId), kart, miktar);
  return maymunXp(db, guildId, kullaniciId, kart);
}

/** Bir kartın maymun durumu (kilitli olsun olmasın): seviye, XP ve direnç. */
export function maymunBilgisi(db, guildId, kullaniciId, kimlik) {
  const kart = kartGetir(kimlik);
  const xp = maymunXp(db, guildId, kullaniciId, kimlik);
  const lvl = seviyeHesapla(xp);
  const oran = direncOrani(kimlik);
  const yollar = yukseltmeOku(db, guildId, kullaniciId, kimlik);
  return {
    kart, xp, ...lvl, oran, direnc: direnc(lvl.seviye, oran), yollar, etki: yukseltmeEtkisi(yollar),
  };
}

/** Maymunsuz çalışan: seviye 0, taban direnç (%16), yükseltmesiz. */
export const MAYMUNSUZ = Object.freeze({
  kart: null,
  xp: 0,
  seviye: 0,
  mevcut: 0,
  gereken: 0,
  oran: 0,
  direnc: direnc(0, 0),
  yollar: [0, 0, 0],
  etki: yukseltmeEtkisi([0, 0, 0]),
});

/**
 * Kilitli maymun ve durumu; kilit yoksa ya da kart artık elde değilse
 * (prestij sıfırladıysa) MAYMUNSUZ. Elde olmayan kilit kendiliğinden kalkar.
 */
export function calisanMaymun(db, guildId, kullaniciId) {
  const kimlik = db
    .prepare('SELECT maymun FROM calismalar WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId))?.maymun ?? null;
  if (!kimlik) return MAYMUNSUZ;
  const seferde = seferdekiler(db, guildId, kullaniciId)[kimlik] ?? 0;
  if (!maymunMu(kimlik) || adet(db, guildId, kullaniciId, kimlik) - seferde < 1) {
    db.prepare('UPDATE calismalar SET maymun = NULL WHERE guild_id = ? AND kullanici_id = ?').run(String(guildId), String(kullaniciId));
    return MAYMUNSUZ;
  }
  return maymunBilgisi(db, guildId, kullaniciId, kimlik);
}

/**
 * Envanterdeki maymunu çalışmaya kilitler (bir kopyası satılamaz, takas,
 * hediye ve birleştirme dışı kalır). Önceki maymunun kilidi kalkar.
 * @returns {{ok: false, sebep: string} | {ok: true, maymun: object}}
 */
export function maymunKilitle(db, { guildId, kullaniciId, kimlik }) {
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Böyle bir kart yok.' };
  if (!maymunMu(kimlik)) return { ok: false, sebep: `**${kart.ad}** çalışamaz: yalnız kuleler ve kahramanlar (maymunlar) çalışır.` };
  const sahip = adet(db, guildId, kullaniciId, kimlik);
  if (sahip < 1) return { ok: false, sebep: `Envanterinde **${kart.ad}** yok.` };
  if (sahip - (seferdekiler(db, guildId, kullaniciId)[kimlik] ?? 0) < 1) {
    return { ok: false, sebep: `**${kart.ad}** seferde; dönmesini bekle ya da \`/maymun geri\` ile geri çağır.` };
  }
  db.prepare(
    `INSERT INTO calismalar (guild_id, kullanici_id, maymun) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET maymun = excluded.maymun`,
  ).run(String(guildId), String(kullaniciId), kimlik);
  return { ok: true, maymun: maymunBilgisi(db, guildId, kullaniciId, kimlik) };
}

/** Kilidi kaldırır; kilitli maymun yoksa false. */
export function maymunBirak(db, { guildId, kullaniciId }) {
  const { changes } = db
    .prepare('UPDATE calismalar SET maymun = NULL WHERE guild_id = ? AND kullanici_id = ? AND maymun IS NOT NULL')
    .run(String(guildId), String(kullaniciId));
  return changes > 0;
}

/** Envanterdeki maymunlar, en dirençliden başlayarak: [{ kimlik, adet, ...maymunBilgisi }]. */
export function maymunlar(db, guildId, kullaniciId) {
  return db
    .prepare('SELECT esya, adet FROM envanter WHERE guild_id = ? AND kullanici_id = ? AND adet > 0')
    .all(String(guildId), String(kullaniciId))
    .filter((s) => maymunMu(s.esya))
    .map((s) => ({ kimlik: s.esya, adet: s.adet, ...maymunBilgisi(db, guildId, kullaniciId, s.esya) }))
    .sort((a, b) => b.direnc - a.direnc || b.xp - a.xp || a.kart.ad.localeCompare(b.kart.ad, 'tr'));
}

/**
 * Maymunun bir yolunu bir kademe yükseltir: kartın elde olması, BTD6 çapraz
 * yol kuralı, maymun seviyesi ve bedel denetlenir; bedel defterde `yukseltme`.
 * @returns {{ok: false, sebep: string} | {ok: true, maymun: object, yol: number, kademe: number, bedel: number, bakiye: number}}
 */
export function maymunYukselt(db, {
  guildId, kullaniciId, kimlik, yol, simdi = Date.now(),
}) {
  const kart = kartGetir(kimlik);
  if (!kart || !maymunMu(kimlik)) return { ok: false, sebep: 'Yalnız maymunlar (kuleler ve kahramanlar) yükseltilir.' };
  if (!Number.isInteger(yol) || !YOLLAR[yol]) return { ok: false, sebep: 'Böyle bir yol yok.' };
  if (adet(db, guildId, kullaniciId, kimlik) < 1) return { ok: false, sebep: `Envanterinde **${kart.ad}** yok.` };

  return islem(db, () => {
    const bilgi = maymunBilgisi(db, guildId, kullaniciId, kimlik);
    const sonraki = sonrakiYukseltme(bilgi.yollar, yol, bilgi.seviye);
    const ad = `${YOLLAR[yol].emoji} ${YOLLAR[yol].ad}`;
    if (sonraki.engel === 'tavan') return { ok: false, sebep: `${ad} yolu zaten en üstte (5).` };
    if (sonraki.engel === 'capraz') {
      return { ok: false, sebep: `${ad} yolu kapalı: bir yol 5'e, ikinci yol en çok 2'ye çıkar, üçüncü yol kapalı kalır.` };
    }
    if (sonraki.engel === 'seviye') {
      return { ok: false, sebep: `${sonraki.kademe}. kademe için **${kart.ad}** Sv ${sonraki.seviye} olmalı (şu an Sv ${bilgi.seviye}). Çalıştıkça ve seferde seviye atlar.` };
    }
    if (dus(db, { guildId, kullaniciId, miktar: sonraki.bedel, tur: TURLER.yukseltme, karsiId: kimlik, simdi }) === null) {
      return { ok: false, sebep: `Bakiyen yetmiyor: bu kademe ${sonraki.bedel.toLocaleString('tr-TR')} muz.` };
    }
    const yollar = bilgi.yollar.map((n, i) => (i === yol ? sonraki.kademe : n));
    db.prepare(
      `INSERT INTO maymun_deneyim (guild_id, kullanici_id, kart, xp, yukseltme) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(guild_id, kullanici_id, kart) DO UPDATE SET yukseltme = excluded.yukseltme`,
    ).run(String(guildId), String(kullaniciId), kimlik, yollar.join('-'));
    return {
      ok: true,
      maymun: maymunBilgisi(db, guildId, kullaniciId, kimlik),
      yol,
      kademe: sonraki.kademe,
      bedel: sonraki.bedel,
      bakiye: bakiye(db, guildId, kullaniciId),
    };
  });
}
