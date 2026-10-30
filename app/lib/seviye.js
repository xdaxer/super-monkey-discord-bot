/**
 * Seviye / XP: mesaj başına XP, karesel seviye eşikleri ve sıralama.
 *
 * Sayılar docs/ekonomi.md ile birebir aynıdır; biri değişirse diğeri de
 * değişmeli. Karar mantığı saf tutuluyor, Discord'a hiç istek atmadan
 * çağrılabiliyor; olay dosyası ile komut yalnız ayar, biçim ve yetki işini yapar.
 */

import { trGunBaslangici } from './ekonomi.js';
import { uzakKimlikler, uzakMi } from './ekonomi-uzak.js';
import { yetkiliKimlikler } from './izin.js';

/** Mesaj başına verilen XP aralığı (iki uç dahil). */
export const XP_MIN = 15;
export const XP_MAX = 25;

/**
 * Ses dakikası başına XP aralığı. Mesajın yaklaşık üçte biri: seste beklemek
 * yazmak kadar emek istemez.
 */
export const SES_XP_MIN = 5;
export const SES_XP_MAX = 10;

/**
 * Aynı kullanıcıya bu süre dolmadan ikinci kez XP verilmez.
 * XP'yi mesaj sayısına değil sunucuda geçirilen zamana bağlar.
 */
export const BEKLEME_MS = 60_000;

/**
 * `n` seviyesinden `n+1` seviyesine geçmek için gereken XP.
 * Karesel: her seviye bir öncekinden pahalı, böylece sıralamanın tepesi donmaz.
 * 2026-10-22'de yarıya indirildi (eskisi 5n² + 50n + 100): en aktif üye bile
 * Sv 40'a ~2 ayda, ilk %10'luk dilim yaklaşık bir yılda varıyordu.
 */
export function gereken(seviye) {
  const n = Math.max(0, Math.floor(seviye));
  return Math.floor((5 * n * n + 50 * n + 100) / 2);
}

/** Verilen seviyeye ulaşmak için gereken toplam (kümülatif) XP. */
export function toplamXp(seviye) {
  let toplam = 0;
  for (let n = 0; n < Math.max(0, Math.floor(seviye)); n += 1) toplam += gereken(n);
  return toplam;
}

/**
 * Toplam XP'den seviyeyi hesaplar.
 * @returns {{seviye: number, suAnki: number, sonraki: number}}
 *   `suAnki`: bulunulan seviyede biriken XP, `sonraki`: seviye atlamak için gereken.
 */
export function seviyeHesapla(xp) {
  let kalan = Math.max(0, Math.floor(xp));
  let seviye = 0;

  while (kalan >= gereken(seviye)) {
    kalan -= gereken(seviye);
    seviye += 1;
  }

  return { seviye, suAnki: kalan, sonraki: gereken(seviye) };
}

/** Test edilebilirlik için dışarıdan verilebilen rastgelelik. */
export function rastgeleXp(rastgele = Math.random, min = XP_MIN, max = XP_MAX) {
  return min + Math.floor(rastgele() * (max - min + 1));
}

/**
 * Mesajın XP kazandırıp kazandırmayacağını söyler. İçeriğe bakmaz:
 * yalnız mesajın türüne ve yazarına bakar, bu yüzden GuildMessages yeter.
 *
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function xpKazandirirMi(mesaj) {
  if (!mesaj?.guild && !mesaj?.guildId) return { ok: false, sebep: 'sunucu-disi' };
  if (mesaj.author?.bot) return { ok: false, sebep: 'bot-mesaji' };
  if (mesaj.system) return { ok: false, sebep: 'sistem-mesaji' };
  return { ok: true };
}

/**
 * Mesajın kanalı XP kanal listesinde mi? Liste boşsa her kanal geçer;
 * thread'ler üst kanalın iznini taşır.
 */
export function xpKanalindaMi(mesaj, liste) {
  if (!Array.isArray(liste) || liste.length === 0) return true;
  const kanal = mesaj?.channel;
  const ust = kanal?.isThread?.() ? kanal.parentId : null;
  return liste.includes(String(mesaj?.channelId)) || Boolean(ust && liste.includes(String(ust)));
}

export function kullaniciGetir(db, guildId, kullaniciId) {
  const satir = db
    .prepare('SELECT xp, seviye, mesaj_sayisi, son_kazanma FROM seviyeler WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));

  return satir ?? { xp: 0, seviye: 0, mesaj_sayisi: 0, son_kazanma: 0 };
}

/**
 * Mesaj (ya da ses dakikası) için XP yazar. Bekleme süresi dolmadıysa hiçbir
 * şey yazmaz. `bonus`, rastgele XP'yi dönüştürür (ör. YouTube üyelerine yüzde
 * bonus). `mesaj: false` ise "Sayılan mesaj" sayacı artmaz. `aralik` rastgele
 * XP'nin uçlarını değiştirir; `ustSinir` bonuslu kazancı kırpar (0 ya da
 * altıysa hiç XP verilmez, bekleme de başlamaz).
 *
 * @returns {{verildi: boolean, kazanilan: number, xp: number,
 *            oncekiSeviye: number, seviye: number, atladi: boolean}}
 */
export function xpVer(db, {
  guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random, bonus = (xp) => xp,
  bekleme = BEKLEME_MS, mesaj = true, aralik = null, ustSinir = Infinity,
} = {}) {
  const mevcut = kullaniciGetir(db, guildId, kullaniciId);

  // son_kazanma = 0 "hiç XP almamış" demek. Doğrudan çıkarma yaparsak küçük
  // `simdi` değerlerinde ilk mesaj da bekleme süresinde sayılır.
  // Ekonomiden uzaklaştırılan üye XP de kazanmaz (mesaj ve ses bu fonksiyondan geçer).
  if (ustSinir <= 0 || (mevcut.son_kazanma > 0 && simdi - mevcut.son_kazanma < bekleme) || uzakMi(db, guildId, kullaniciId)) {
    return {
      verildi: false, kazanilan: 0, xp: mevcut.xp,
      oncekiSeviye: mevcut.seviye, seviye: mevcut.seviye, atladi: false,
    };
  }

  const ham = aralik ? rastgeleXp(rastgele, aralik.min, aralik.max) : rastgeleXp(rastgele);
  const kazanilan = Math.min(bonus(ham), ustSinir);
  const yeniXp = mevcut.xp + kazanilan;
  const { seviye } = seviyeHesapla(yeniXp);

  db.prepare(
    `INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye, mesaj_sayisi, son_kazanma)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET
       xp = excluded.xp, seviye = excluded.seviye,
       mesaj_sayisi = seviyeler.mesaj_sayisi + excluded.mesaj_sayisi, son_kazanma = excluded.son_kazanma`,
  ).run(String(guildId), String(kullaniciId), yeniXp, seviye, mesaj ? 1 : 0, simdi);

  return {
    verildi: true, kazanilan, xp: yeniXp,
    oncekiSeviye: mevcut.seviye, seviye, atladi: seviye > mevcut.seviye,
  };
}

/**
 * Ses taraması bu aralıkla döner. Bekleme mesajla ortak (`son_kazanma`):
 * aynı dakikada hem yazan hem seste duran yine tek XP alır.
 */
export const SES_PERIYOT_MS = 60_000;

/**
 * Ses için bekleme biraz kısa tutulur: zamanlayıcı kayması yüzünden bir
 * önceki turdan 59.9 sn sonra gelen tur boşa gitmesin.
 */
export const SES_BEKLEME_MS = BEKLEME_MS - 5_000;

/**
 * Ses kanalındaki üyelerden XP kazanacak olanları seçer. Saf: yalnız
 * kanal/üye nesnelerinin alanlarına bakar.
 *
 * Kurallar: AFK kanalı sayılmaz; bot ve kulaklığı kapalı (kendi ya da
 * sunucu tarafından) üye kazanmaz; kanalda kulaklığı açık en az iki insan
 * yoksa kimse kazanmaz (tek başına bekleyerek XP kasılmasın). Kanalda
 * mikrofonu açık en az bir insan olmalı: herkes susturulmuşsa konuşma yok,
 * AFK beklemedir. Kişinin kendi mikrofonu kapalı olabilir; dinleyen de
 * sohbetin parçası.
 *
 * @param {Array<{kanalId: string, kullaniciId: string, bot?: boolean,
 *   sagir?: boolean, susturulmus?: boolean}>} durumlar  ses durumları
 * @param {{afkKanalId?: string|null}} [secenek]
 * @returns {string[]} XP verilecek kullanıcı kimlikleri
 */
export function sesXpAlanlar(durumlar, { afkKanalId = null } = {}) {
  const kanallar = new Map();
  for (const d of durumlar ?? []) {
    if (!d?.kanalId || d.bot || d.sagir) continue;
    if (afkKanalId && d.kanalId === afkKanalId) continue;
    if (!kanallar.has(d.kanalId)) kanallar.set(d.kanalId, { uyeler: [], konusan: false });
    const kanal = kanallar.get(d.kanalId);
    kanal.uyeler.push(String(d.kullaniciId));
    if (!d.susturulmus) kanal.konusan = true;
  }

  const alanlar = [];
  for (const { uyeler, konusan } of kanallar.values()) {
    if (uyeler.length >= 2 && konusan) alanlar.push(...uyeler);
  }
  return alanlar;
}

/** Ses XP'si günlük tavanının ayar anahtarı ve varsayılanı (lib/ayarlar.js). */
export const SES_GUNLUK_AYAR = 'seviye.sesXpGunluk';
export const SES_GUNLUK_VARSAYILAN = 1_000;

/** Üyenin bu Türkiye gününde sesten kazandığı XP. */
export function sesXpBugun(db, guildId, kullaniciId, simdi = Date.now()) {
  const satir = db
    .prepare('SELECT gun, xp FROM ses_xp_gunluk WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return satir && satir.gun === trGunBaslangici(simdi) ? satir.xp : 0;
}

/**
 * Bir ses dakikası için XP: SES_XP_MIN–MAX (bonuslarla), günlük `tavan`ı
 * aşmayacak şekilde kırpılır. Tavan dolunca XP verilmez; mesaj XP'si bu
 * tavandan etkilenmez. Kişi başı tek satır tutulur, gün değişince sıfırlanır.
 */
export function sesXpVer(db, {
  guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random, bonus = (xp) => xp,
  tavan = SES_GUNLUK_VARSAYILAN,
} = {}) {
  const bugun = sesXpBugun(db, guildId, kullaniciId, simdi);
  const sonuc = xpVer(db, {
    guildId, kullaniciId, simdi, rastgele, bonus,
    bekleme: SES_BEKLEME_MS, mesaj: false,
    aralik: { min: SES_XP_MIN, max: SES_XP_MAX }, ustSinir: tavan - bugun,
  });
  if (sonuc.verildi) {
    const gun = trGunBaslangici(simdi);
    db.prepare(
      `INSERT INTO ses_xp_gunluk (guild_id, kullanici_id, gun, xp) VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET
         xp = CASE WHEN ses_xp_gunluk.gun = excluded.gun THEN ses_xp_gunluk.xp + excluded.xp ELSE excluded.xp END,
         gun = excluded.gun`,
    ).run(String(guildId), String(kullaniciId), gun, sonuc.kazanilan);
  }
  return { ...sonuc, bugun: bugun + (sonuc.verildi ? sonuc.kazanilan : 0) };
}

/** `kullanici_id NOT IN (...)` parçası ve parametreleri; liste boşsa koşulsuz. */
function haricKosulu(haric, db = null, guildId = null) {
  // Ekonomiden uzaklaştırılanlar XP sıralamasında da görünmez.
  const kimlikler = [...haric.map(String), ...(db ? uzakKimlikler(db, guildId) : [])];
  if (kimlikler.length === 0) return { sql: '', parametreler: [] };
  return { sql: ` AND kullanici_id NOT IN (${kimlikler.map(() => '?').join(', ')})`, parametreler: kimlikler };
}

/**
 * Sunucunun XP'ye göre azalan sıralaması. Bot sahibi ve geliştiriciler
 * (yetkiliKimlikler) muz sıralamalarında olduğu gibi burada da yer almaz.
 * Seviye XP'den hesaplanır: eşik değişince kayıtlı seviye üyenin bir sonraki
 * XP'sine kadar eski kalır (atlama ödülü o zaman verilir).
 */
export function siralama(db, guildId, limit = 10, haric = yetkiliKimlikler()) {
  const h = haricKosulu(haric, db, guildId);
  return db
    .prepare(
      `SELECT kullanici_id, xp, seviye, mesaj_sayisi FROM seviyeler
       WHERE guild_id = ?${h.sql} ORDER BY xp DESC, kullanici_id ASC LIMIT ?`,
    )
    .all(String(guildId), ...h.parametreler, Math.max(1, Math.floor(limit)))
    .map((s) => ({ ...s, seviye: seviyeHesapla(s.xp).seviye }));
}

/** Kullanıcının sunucudaki sırası (1 tabanlı); kaydı yoksa ya da yetkiliyse null, yetkililer sayılmaz. */
export function sira(db, guildId, kullaniciId, haric = yetkiliKimlikler()) {
  if (haric.map(String).includes(String(kullaniciId))) return null;
  const kendi = db
    .prepare('SELECT xp FROM seviyeler WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  if (!kendi) return null;

  const h = haricKosulu(haric, db, guildId);
  const onde = db
    .prepare(`SELECT COUNT(*) AS adet FROM seviyeler WHERE guild_id = ? AND xp > ?${h.sql}`)
    .get(String(guildId), kendi.xp, ...h.parametreler);

  return (onde?.adet ?? 0) + 1;
}

/** Seviye atlama duyurusundaki yer tutucuları doldurur. */
export function duyuruMetni(sablon, { kullaniciId, seviye, sunucuAdi }) {
  return String(sablon ?? '')
    .replaceAll('{kullanici}', `<@${kullaniciId}>`)
    .replaceAll('{seviye}', String(seviye))
    .replaceAll('{sunucu}', String(sunucuAdi ?? ''));
}
